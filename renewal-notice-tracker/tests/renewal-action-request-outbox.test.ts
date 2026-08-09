import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendRenewalActionRequestEmail: vi.fn(),
  listAdminQueuedRenewalActionNotifications: vi.fn(),
  claimAdminRenewalActionNotification: vi.fn(),
  getAdminRenewalActionRequestById: vi.fn(),
  getAdminRenewalActionContractContext: vi.fn(),
  getAdminNotificationUserLabel: vi.fn(),
  updateAdminRenewalActionNotification: vi.fn()
}));

vi.mock("@/lib/email/send-reminder", () => ({
  sendRenewalActionRequestEmail: mocks.sendRenewalActionRequestEmail
}));

vi.mock("@/lib/notifications/repositories/admin-renewal-action-notifications-repository", () => ({
  listAdminQueuedRenewalActionNotifications: mocks.listAdminQueuedRenewalActionNotifications,
  claimAdminRenewalActionNotification: mocks.claimAdminRenewalActionNotification,
  getAdminRenewalActionRequestById: mocks.getAdminRenewalActionRequestById,
  getAdminRenewalActionContractContext: mocks.getAdminRenewalActionContractContext,
  getAdminNotificationUserLabel: mocks.getAdminNotificationUserLabel,
  updateAdminRenewalActionNotification: mocks.updateAdminRenewalActionNotification
}));

import {
  buildRenewalActionRequestNotificationDeliveryKey,
  processQueuedRenewalActionRequestNotifications,
  processRenewalActionRequestNotification,
  sanitizeRenewalActionNotificationError
} from "@/lib/notifications/renewal-action-request-outbox";

const notification = {
  id: "notification-1",
  organization_id: "org-1",
  recipient_email: "owner@example.com",
  delivery_key: "renewal_action_request:request-1:email",
  provider_payload: {
    request_id: "request-1",
    contract_id: "contract-1",
    outbox_scope: "internal_owner_action_request"
  },
  status: "queued"
};

function mockRequest(overrides?: Record<string, unknown>) {
  mocks.getAdminRenewalActionRequestById.mockResolvedValue({
    data: {
      id: "request-1",
      contract_id: "contract-1",
      organization_id: "org-1",
      requested_to_user_id: "owner-1",
      requested_by_user_id: "operator-1",
      requested_action: "decide_renewal",
      request_status: "pending",
      due_date: "2030-01-01",
      due_at: "2030-01-01T00:00:00.000Z",
      message: "Internal decision request.",
      ...overrides
    },
    error: null
  });
}

function mockContract() {
  mocks.getAdminRenewalActionContractContext.mockResolvedValue({
    data: {
      id: "contract-1",
      organization_id: "org-1",
      owner_user_id: "owner-1",
      contract_metadata: {
        contract_title: "Acme MSA",
        counterparty_name: "Acme",
        notice_deadline_date: "2030-01-01",
        renewal_date: "2030-02-01",
        expiration_date: null,
        contract_value_amount: 100000,
        contract_value_currency: "USD"
      }
    },
    error: null
  });
}

describe("renewal action request notification outbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendRenewalActionRequestEmail.mockResolvedValue({ data: { id: "email-1" } });
    mocks.updateAdminRenewalActionNotification.mockResolvedValue({
      data: { id: "notification-1", status: "sent" },
      error: null
    });
    mocks.getAdminNotificationUserLabel.mockResolvedValue({
      data: { id: "operator-1", full_name: "Operator", notification_email: "operator@example.com" },
      error: null
    });
    mockRequest();
    mockContract();
  });

  it("builds a stable delivery key from the request id", () => {
    expect(buildRenewalActionRequestNotificationDeliveryKey("request-1")).toBe(
      "renewal_action_request:request-1:email"
    );
  });

  it("sends a queued internal owner notification and marks the same outbox row sent", async () => {
    const result = await processRenewalActionRequestNotification(notification);

    expect(result).toEqual({ id: "notification-1", status: "sent" });
    expect(mocks.sendRenewalActionRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        recipientEmail: "owner@example.com",
        contractId: "contract-1",
        contractTitle: "Acme MSA",
        counterpartyName: "Acme",
        dueAt: "2030-01-01"
      })
    );
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        update: expect.objectContaining({
          status: "sent",
          provider_message_id: "email-1",
          provider_payload: expect.objectContaining({
            request_id: "request-1",
            contract_id: "contract-1",
            outbox_scope: "internal_owner_action_request"
          })
        })
      })
    );
  });

  it("does not send when the business request is no longer pending", async () => {
    mockRequest({ request_status: "completed" });

    const result = await processRenewalActionRequestNotification(notification);

    expect(result).toEqual({ id: "notification-1", status: "failed" });
    expect(mocks.sendRenewalActionRequestEmail).not.toHaveBeenCalled();
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "failed",
          error_message: "Renewal action request is no longer pending."
        })
      })
    );
  });

  it("sanitizes provider failures and keeps the same retryable outbox record", async () => {
    mocks.sendRenewalActionRequestEmail.mockRejectedValueOnce(
      new Error("provider payload leaked raw contract text and secret token")
    );

    const result = await processRenewalActionRequestNotification(notification);

    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toMatch(/raw contract text|secret token/i);
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        update: expect.objectContaining({
          status: "failed",
          error_message: expect.not.stringMatching(/raw contract text|secret token/i),
          provider_payload: expect.objectContaining({
            request_id: "request-1",
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_DELIVERY_FAILED_001"
          })
        })
      })
    );
  });

  it("claims queued rows before processing so retries reuse the notification row", async () => {
    mocks.listAdminQueuedRenewalActionNotifications.mockResolvedValue({
      data: [notification],
      error: null
    });
    mocks.claimAdminRenewalActionNotification.mockResolvedValue({
      data: notification,
      error: null
    });

    const results = await processQueuedRenewalActionRequestNotifications({ limit: 5 });

    expect(results).toEqual([{ id: "notification-1", status: "sent" }]);
    expect(mocks.claimAdminRenewalActionNotification).toHaveBeenCalledWith({
      notificationId: "notification-1",
      organizationId: "org-1"
    });
    expect(mocks.sendRenewalActionRequestEmail).toHaveBeenCalledTimes(1);
  });

  it("redacts sensitive marker strings from delivery errors", () => {
    expect(
      sanitizeRenewalActionNotificationError(
        new Error("raw contract text, private notes, provider response, secret token")
      )
    ).not.toMatch(/raw contract text|private notes|provider response|secret token/i);
  });
});
