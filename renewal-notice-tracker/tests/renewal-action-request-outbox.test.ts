import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildRenewalActionRequestEmailProviderRequest: vi.fn((input: Record<string, unknown>) => ({
    from: "NoticeControl <notifications@noticecontrol.com>",
    to: input.recipientEmail,
    replyTo: "support@noticecontrol.com",
    subject: `Renewal decision requested: ${input.contractTitle}`,
    html: `<p>${input.contractTitle}</p><p>${input.counterpartyName}</p><p>${input.message ?? ""}</p>`
  })),
  sendRenewalActionRequestEmailProviderRequest: vi.fn(),
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
  buildRenewalActionRequestEmailProviderRequest: mocks.buildRenewalActionRequestEmailProviderRequest,
  sendRenewalActionRequestEmailProviderRequest: mocks.sendRenewalActionRequestEmailProviderRequest
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
  classifyRenewalActionNotificationDeliveryError,
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
  status: "processing",
  attempt_count: 0,
  max_attempts: 4,
  next_retry_at: null,
  processing_started_at: null,
  processing_token: "token-1",
  provider_message_id: null
};

const stableProviderRequest = {
  from: "NoticeControl <notifications@noticecontrol.com>",
  to: "owner@example.com",
  replyTo: "support@noticecontrol.com",
  subject: "Renewal decision requested: Acme MSA",
  html: "<p>Frozen Acme MSA</p>"
};

function notificationWithEmailSnapshot(overrides?: Record<string, unknown>) {
  return {
    ...notification,
    provider_payload: {
      ...notification.provider_payload,
      email_delivery_snapshot: {
        version: "renewal_action_request_email.v1",
        providerRequest: stableProviderRequest,
        requestId: "request-1",
        contractId: "contract-1",
        requestedAction: "decide_renewal"
      }
    },
    ...overrides
  };
}

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
    mocks.buildRenewalActionRequestEmailProviderRequest.mockImplementation((input: Record<string, unknown>) => ({
      from: "NoticeControl <notifications@noticecontrol.com>",
      to: input.recipientEmail,
      replyTo: "support@noticecontrol.com",
      subject: `Renewal decision requested: ${input.contractTitle}`,
      html: `<p>${input.contractTitle}</p><p>${input.counterpartyName}</p><p>${input.message ?? ""}</p>`
    }));
    mocks.sendRenewalActionRequestEmailProviderRequest.mockResolvedValue({ data: { id: "email-1" }, error: null });
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
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        providerRequest: expect.objectContaining({
          to: "owner@example.com",
          subject: "Renewal decision requested: Acme MSA",
          html: expect.stringContaining("Internal decision request.")
        }),
        deliveryKey: "renewal_action_request:request-1:email",
      })
    );
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        processingToken: "token-1",
        update: expect.objectContaining({
          status: "processing",
          provider_payload: expect.objectContaining({
            email_delivery_snapshot: expect.objectContaining({
              version: "renewal_action_request_email.v1",
              providerRequest: expect.objectContaining({
                subject: "Renewal decision requested: Acme MSA"
              })
            })
          })
        })
      })
    );
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        processingToken: "token-1",
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
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).not.toHaveBeenCalled();
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        processingToken: "token-1",
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
    mocks.sendRenewalActionRequestEmailProviderRequest.mockRejectedValueOnce(
      new Error("temporary timeout leaked raw contract text and secret token")
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
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_TRANSIENT_PROVIDER_FAILURE_001",
            failure_category: "timeout",
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
    mocks.sendRenewalActionRequestEmailProviderRequest.mockRejectedValueOnce(error);

    const result = await processRenewalActionRequestNotification(notification);

    expect(result.status).toBe("failed_terminal");
    expect(result).toEqual(expect.objectContaining({ nextRetryAt: null }));
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        processingToken: "token-1",
        update: expect.objectContaining({
          status: "failed_terminal",
          next_retry_at: null,
          provider_payload: expect.objectContaining({
            failure_category: "permanent_recipient_failure"
          })
        })
      })
    );
  });

  it("marks retry exhaustion terminal at max attempts", async () => {
    mocks.sendRenewalActionRequestEmailProviderRequest.mockRejectedValueOnce(new Error("temporary timeout"));

    const result = await processRenewalActionRequestNotification({
      ...notification,
      attempt_count: 3,
      max_attempts: 4
    });

    expect(result.status).toBe("failed_terminal");
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        processingToken: "token-1",
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
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).not.toHaveBeenCalled();
  });

  it("does not call the provider when a processing token is missing", async () => {
    const result = await processRenewalActionRequestNotification({
      ...notification,
      status: "processing",
      processing_token: null
    });

    expect(result).toEqual({ id: "notification-1", status: "claim_lost" });
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).not.toHaveBeenCalled();
    expect(mocks.updateAdminRenewalActionNotification).not.toHaveBeenCalled();
  });

  it("prevents a stale worker from overwriting a newer worker completion", async () => {
    mocks.updateAdminRenewalActionNotification.mockResolvedValueOnce({
      data: null,
      error: null
    });

    const result = await processRenewalActionRequestNotification({
      ...notificationWithEmailSnapshot(),
      processing_token: "stale-token"
    });

    expect(result).toEqual({ id: "notification-1", status: "claim_lost" });
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenCalledTimes(1);
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        processingToken: "stale-token",
        update: expect.objectContaining({ status: "sent" })
      })
    );
    expect(mocks.emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "renewal_action_notification_claim_lost",
        metadata: expect.objectContaining({
          claim_lost_reason: "processing_token_mismatch_or_status_changed"
        })
      })
    );
  });

  it("reuses the stable delivery key across retry attempts", async () => {
    mocks.sendRenewalActionRequestEmailProviderRequest.mockRejectedValueOnce(new Error("temporary timeout"));
    await processRenewalActionRequestNotification({
      ...notification,
      attempt_count: 1,
      processing_token: "retry-token"
    });

    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryKey: "renewal_action_request:request-1:email"
      })
    );
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        processingToken: "retry-token",
        update: expect.objectContaining({
          status: "retry_pending",
          attempt_count: 2
        })
      })
    );
  });

  it("freezes provider payload before first delivery and reuses identical parameters on retry after live edits", async () => {
    mocks.sendRenewalActionRequestEmailProviderRequest.mockRejectedValueOnce(new Error("temporary timeout"));

    await processRenewalActionRequestNotification(notification);

    const firstProviderCall = mocks.sendRenewalActionRequestEmailProviderRequest.mock.calls[0]?.[0];
    const snapshotUpdate = mocks.updateAdminRenewalActionNotification.mock.calls.find(
      ([input]) => input.update?.status === "processing"
    )?.[0];
    const persistedPayload = snapshotUpdate?.update?.provider_payload;
    expect(persistedPayload).toEqual(
      expect.objectContaining({
        email_delivery_snapshot: expect.objectContaining({
          version: "renewal_action_request_email.v1",
          providerRequest: firstProviderCall.providerRequest
        })
      })
    );

    mockRequest({ message: "Edited request message after first attempt." });
    mocks.getAdminRenewalActionContractContext.mockResolvedValue({
      data: {
        id: "contract-1",
        organization_id: "org-1",
        owner_user_id: "owner-1",
        contract_metadata: {
          contract_title: "Edited Contract Title",
          counterparty_name: "Edited Vendor",
          notice_deadline_date: "2040-01-01",
          renewal_date: "2040-02-01",
          expiration_date: null,
          contract_value_amount: 999999,
          contract_value_currency: "EUR"
        }
      },
      error: null
    });
    mocks.sendRenewalActionRequestEmailProviderRequest.mockClear();
    mocks.buildRenewalActionRequestEmailProviderRequest.mockClear();
    mocks.updateAdminRenewalActionNotification.mockClear();
    mocks.sendRenewalActionRequestEmailProviderRequest.mockResolvedValueOnce({ data: { id: "email-2" }, error: null });

    await processRenewalActionRequestNotification({
      ...notification,
      attempt_count: 1,
      processing_token: "retry-token",
      provider_payload: persistedPayload
    });

    expect(mocks.buildRenewalActionRequestEmailProviderRequest).not.toHaveBeenCalled();
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenCalledWith(firstProviderCall);
  });

  it("uses distinct provider idempotency keys for distinct renewal action notifications", async () => {
    expect(buildRenewalActionRequestNotificationDeliveryKey("request-1")).not.toBe(
      buildRenewalActionRequestNotificationDeliveryKey("request-2")
    );
  });

  it("keeps sensitive marker strings out of the durable email snapshot", async () => {
    mockRequest({
      message: "raw contract text and provider payload and secret token should not persist"
    });
    mocks.getAdminRenewalActionContractContext.mockResolvedValue({
      data: {
        id: "contract-1",
        organization_id: "org-1",
        owner_user_id: "owner-1",
        contract_metadata: {
          contract_title: "raw contract text title",
          counterparty_name: "provider payload vendor",
          notice_deadline_date: "2030-01-01",
          renewal_date: "2030-02-01",
          expiration_date: null,
          contract_value_amount: 100000,
          contract_value_currency: "USD"
        }
      },
      error: null
    });

    await processRenewalActionRequestNotification(notification);
    const snapshotUpdate = mocks.updateAdminRenewalActionNotification.mock.calls.find(
      ([input]) => input.update?.status === "processing"
    )?.[0];

    expect(JSON.stringify(snapshotUpdate?.update?.provider_payload)).not.toMatch(
      /raw contract text|provider payload|secret token/i
    );
  });

  it("classifies Resend idempotency, retry, and recipient errors with stable safe categories", () => {
    expect(classifyRenewalActionNotificationDeliveryError({ name: "invalid_idempotency_key" })).toMatchObject({
      permanent: true,
      alert: true,
      failureCategory: "provider_idempotency_configuration_failure"
    });
    expect(classifyRenewalActionNotificationDeliveryError({ name: "invalid_idempotent_request" })).toMatchObject({
      permanent: true,
      alert: true,
      failureCategory: "provider_idempotency_payload_mismatch"
    });
    expect(classifyRenewalActionNotificationDeliveryError({ name: "concurrent_idempotent_requests" })).toMatchObject({
      retryable: true,
      permanent: false,
      failureCategory: "provider_idempotency_concurrent_request"
    });
    expect(classifyRenewalActionNotificationDeliveryError({ statusCode: 429 })).toMatchObject({
      retryable: true,
      failureCategory: "provider_rate_limited"
    });
    expect(classifyRenewalActionNotificationDeliveryError({ statusCode: 503 })).toMatchObject({
      retryable: true,
      failureCategory: "upstream_provider_failed"
    });
    expect(classifyRenewalActionNotificationDeliveryError(new Error("invalid recipient suppressed"))).toMatchObject({
      permanent: true,
      failureCategory: "permanent_recipient_failure"
    });
  });

  it("treats Resend payload-mismatch idempotency errors as terminal alert-worthy failures", async () => {
    mocks.sendRenewalActionRequestEmailProviderRequest.mockResolvedValueOnce({
      data: null,
      error: {
        name: "invalid_idempotent_request",
        message: "Provider rejected a changed idempotent request."
      }
    });

    const result = await processRenewalActionRequestNotification(notificationWithEmailSnapshot());

    expect(result.status).toBe("failed_terminal");
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "failed_terminal",
          provider_payload: expect.objectContaining({
            failure_code: "ERR_RENEWAL_ACTION_NOTIFICATION_IDEMPOTENCY_PAYLOAD_MISMATCH_001",
            failure_category: "provider_idempotency_payload_mismatch"
          })
        })
      })
    );
    expect(mocks.emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "renewal_action_notification_terminal_failed",
        severity: "P1",
        alert: true
      })
    );
  });

  it("keeps stale and reclaimed workers on the same provider key and payload when both reach Resend", async () => {
    mocks.updateAdminRenewalActionNotification
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { id: "notification-1", status: "sent" }, error: null });

    const staleResult = await processRenewalActionRequestNotification({
      ...notificationWithEmailSnapshot(),
      processing_token: "worker-a-stale"
    });
    const reclaimedResult = await processRenewalActionRequestNotification({
      ...notificationWithEmailSnapshot(),
      processing_token: "worker-b-current"
    });

    expect(staleResult).toEqual({ id: "notification-1", status: "claim_lost" });
    expect(reclaimedResult).toEqual({ id: "notification-1", status: "sent" });
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenNthCalledWith(1, {
      providerRequest: stableProviderRequest,
      deliveryKey: "renewal_action_request:request-1:email"
    });
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).toHaveBeenNthCalledWith(2, {
      providerRequest: stableProviderRequest,
      deliveryKey: "renewal_action_request:request-1:email"
    });
    expect(JSON.stringify(mocks.emitOperationalEvent.mock.calls)).not.toMatch(/owner@example\.com|Frozen Acme/i);
  });

  it("claims due rows before processing so overlapping workers cannot send the same row", async () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    mocks.listAdminQueuedRenewalActionNotifications.mockResolvedValue({
      data: [{ ...notification, status: "queued", processing_token: null }],
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
    expect(mocks.sendRenewalActionRequestEmailProviderRequest).not.toHaveBeenCalled();
  });

  it("carries the generated claim token through a valid sent transition", async () => {
    const now = new Date("2030-01-01T12:00:00.000Z");
    mocks.listAdminQueuedRenewalActionNotifications.mockResolvedValue({
      data: [{ ...notification, status: "queued", processing_token: null }],
      error: null
    });
    mocks.claimAdminRenewalActionNotification.mockImplementation(async (input: { processingToken: string }) => ({
      data: {
        ...notification,
        status: "processing",
        processing_token: input.processingToken
      },
      error: null
    }));

    const results = await processQueuedRenewalActionRequestNotifications({ limit: 5, now });
    const claimInput = mocks.claimAdminRenewalActionNotification.mock.calls[0]?.[0] as
      | { processingToken: string }
      | undefined;
    expect(claimInput).toBeDefined();
    const processingToken = claimInput?.processingToken;

    expect(results).toEqual([{ id: "notification-1", status: "sent" }]);
    expect(mocks.updateAdminRenewalActionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "notification-1",
        organizationId: "org-1",
        processingToken,
        update: expect.objectContaining({ status: "sent" })
      })
    );
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
