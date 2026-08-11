import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendRenewalActionRequestEmail: vi.fn(),
  listAdminQueuedRenewalActionNotifications: vi.fn(),
  claimAdminRenewalActionNotification: vi.fn(),
  rescueAdminStaleRenewalActionNotifications: vi.fn(),
  getAdminRenewalActionRequestById: vi.fn(),
  getAdminRenewalActionContractContext: vi.fn(),
  getAdminNotificationUserLabel: vi.fn(),
  updateAdminRenewalActionNotification: vi.fn(),
  emitOperationalEvent: vi.fn()
}));

vi.mock("@/lib/email/send-reminder", () => ({
  sendRenewalActionRequestEmail: mocks.sendRenewalActionRequestEmail
}));

vi.mock("@/lib/notifications/repositories/admin-renewal-action-notifications-repository", () => ({
  listAdminQueuedRenewalActionNotifications: mocks.listAdminQueuedRenewalActionNotifications,
  claimAdminRenewalActionNotification: mocks.claimAdminRenewalActionNotification,
  rescueAdminStaleRenewalActionNotifications: mocks.rescueAdminStaleRenewalActionNotifications,
  getAdminRenewalActionRequestById: mocks.getAdminRenewalActionRequestById,
  getAdminRenewalActionContractContext: mocks.getAdminRenewalActionContractContext,
  getAdminNotificationUserLabel: mocks.getAdminNotificationUserLabel,
  updateAdminRenewalActionNotification: mocks.updateAdminRenewalActionNotification
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent: mocks.emitOperationalEvent
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
  status: "queued",
  attempt_count: 0,
  max_attempts: 4,
  next_retry_at: null,
  processing_started_at: null,
  processing_token: null,
  provider_message_id: null
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
    mocks.rescueAdminStaleRenewalActionNotifications.mockResolvedValue({ data: [], error: null });
    mocks.getAdminNotificationUserLabel.mockResolvedValue({
      data: { id: "operator-1", full_name: "Operator", notification_email: "operator@example.com" },
      error: null
    });
    mocks.emitOperationalEvent.mockResolvedValue({});
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
          attempt_count: 1,
          processing_started_at: null,
          processing_token: null,
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

    expect(result).toEqual({ id: "notification-1", status: "skipped" });
    expect(mocks.sendRenewalActionRequestEmail).not.toHaveBeenCalled();
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "skipped",
          error_message: "Renewal action request is no longer pending.",
          provider_payload: expect.objectContaining({
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_NOT_PENDING_001"
          })
        })
      })
    );
  });

  it("schedules bounded retry metadata for transient provider failures", async () => {
    mocks.sendRenewalActionRequestEmail.mockRejectedValueOnce(
      new Error("provider payload leaked raw contract text and secret token")
    );

    const result = await processRenewalActionRequestNotification(notification);

    expect(result.status).toBe("retry_pending");
    expect(result).toEqual(expect.objectContaining({ nextRetryAt: expect.any(String) }));
    expect(JSON.stringify(result)).not.toMatch(/raw contract text|secret token/i);
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        update: expect.objectContaining({
          status: "retry_pending",
          attempt_count: 1,
          next_retry_at: expect.any(String),
          error_message: expect.not.stringMatching(/raw contract text|secret token/i),
          provider_payload: expect.objectContaining({
            request_id: "request-1",
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_DELIVERY_FAILED_001",
            failure_category: "transient_provider_failure",
            attempt_count: 1,
            max_attempts: 4
          })
        })
      })
    );
    expect(JSON.stringify(mocks.emitOperationalEvent.mock.calls)).not.toMatch(/owner@example\.com|raw contract text|secret token/i);
  });

  it("marks permanent provider failures terminal without retrying", async () => {
    const error = new Error("invalid recipient");
    Object.assign(error, { permanent: true });
    mocks.sendRenewalActionRequestEmail.mockRejectedValueOnce(error);

    const result = await processRenewalActionRequestNotification(notification);

    expect(result.status).toBe("failed_terminal");
    expect(result).toEqual(expect.objectContaining({ nextRetryAt: null }));
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "failed_terminal",
          next_retry_at: null,
          provider_payload: expect.objectContaining({
            failure_category: "retry_exhausted_or_permanent_failure"
          })
        })
      })
    );
  });

  it("marks retry exhaustion terminal at max attempts", async () => {
    mocks.sendRenewalActionRequestEmail.mockRejectedValueOnce(new Error("temporary timeout"));

    const result = await processRenewalActionRequestNotification({
      ...notification,
      attempt_count: 3,
      max_attempts: 4
    });

    expect(result.status).toBe("failed_terminal");
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "failed_terminal",
          attempt_count: 4,
          next_retry_at: null
        })
      })
    );
  });

  it("suppresses duplicate sends when the row already has provider evidence", async () => {
    const result = await processRenewalActionRequestNotification({
      ...notification,
      status: "sent",
      provider_message_id: "email-1"
    });

    expect(result).toEqual({ id: "notification-1", status: "duplicate_suppressed" });
    expect(mocks.sendRenewalActionRequestEmail).not.toHaveBeenCalled();
  });

  it("claims due rows before processing so overlapping workers cannot send the same row", async () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    mocks.listAdminQueuedRenewalActionNotifications.mockResolvedValue({
      data: [notification],
      error: null
    });
    mocks.claimAdminRenewalActionNotification.mockResolvedValue({
      data: null,
      error: null
    });

    const results = await processQueuedRenewalActionRequestNotifications({ limit: 5, now });

    expect(results).toEqual([]);
    expect(mocks.claimAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        nowIso: "2030-01-01T12:00:00.000Z",
        processingToken: expect.any(String)
      })
    );
    expect(mocks.sendRenewalActionRequestEmail).not.toHaveBeenCalled();
  });

  it("rescues stale processing claims before listing due rows", async () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    mocks.rescueAdminStaleRenewalActionNotifications.mockResolvedValue({
      data: [{ ...notification, status: "retry_pending", processing_started_at: "2030-01-01T11:00:00.000Z" }],
      error: null
    });
    mocks.listAdminQueuedRenewalActionNotifications.mockResolvedValue({ data: [], error: null });

    const results = await processQueuedRenewalActionRequestNotifications({ limit: 5, now });

    expect(results).toEqual([]);
    expect(mocks.rescueAdminStaleRenewalActionNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        staleBeforeIso: "2030-01-01T11:50:00.000Z",
        nextRetryAt: expect.any(String),
        limit: 25
      })
    );
    expect(mocks.listAdminQueuedRenewalActionNotifications).toHaveBeenCalledWith({
      limit: 5,
      nowIso: "2030-01-01T12:00:00.000Z"
    });
  });

  it("redacts sensitive marker strings from delivery errors", () => {
    expect(
      sanitizeRenewalActionNotificationError(
        new Error("raw contract text, private notes, provider response, secret token")
      )
    ).not.toMatch(/raw contract text|private notes|provider response|secret token/i);
  });
});
