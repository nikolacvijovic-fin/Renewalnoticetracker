import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueDueTrustedReminderDeliveryJobsMock = vi.fn();
const processQueuedRenewalActionRequestNotificationsMock = vi.fn();
const logServerError = vi.fn();
const logServerWarn = vi.fn();
const emitOperationalEvent = vi.fn();
const frozenNow = new Date("2030-01-01T12:00:00.000Z");
let POST: (request: Request) => Promise<Response>;

vi.mock("@/lib/notifications/reminders", () => ({
  enqueueDueTrustedReminderDeliveryJobs: enqueueDueTrustedReminderDeliveryJobsMock
}));

vi.mock("@/lib/notifications/renewal-action-request-outbox", () => ({
  processQueuedRenewalActionRequestNotifications: processQueuedRenewalActionRequestNotificationsMock
}));

vi.mock("@/lib/observability/server-logger", () => ({
  logServerError,
  logServerWarn,
  sanitizeOperationalError: vi.fn(() => ({ name: "Error", message: "[REDACTED]" })),
  sanitizeOperationalValue: vi.fn((value: unknown) => value)
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({
    internal: {
      cronSharedSecret: "test-secret"
    },
    operations: {
      monitoringEventSink: "structured_log",
      monitoringAlertWebhookUrl: null,
      monitoringAlertWebhookSigningSecret: null,
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await"
    }
  })
}));

describe("send reminders cron route", () => {
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/cron/send-reminders/route"));
  }, 30000);

  beforeEach(() => {
    vi.clearAllMocks();
    enqueueDueTrustedReminderDeliveryJobsMock.mockReset();
    processQueuedRenewalActionRequestNotificationsMock.mockReset();
    processQueuedRenewalActionRequestNotificationsMock.mockResolvedValue([]);
    emitOperationalEvent.mockReset();
    emitOperationalEvent.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects requests without the cron secret header", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST"
      })
    );

    expect(response.status).toBe(401);
    expect(enqueueDueTrustedReminderDeliveryJobsMock).not.toHaveBeenCalled();
    expect(processQueuedRenewalActionRequestNotificationsMock).not.toHaveBeenCalled();
  });

  it("rejects unauthorized requests", async () => {
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "wrong-secret"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(enqueueDueTrustedReminderDeliveryJobsMock).not.toHaveBeenCalled();
    expect(processQueuedRenewalActionRequestNotificationsMock).not.toHaveBeenCalled();
  });

  it("returns an empty result for authorized requests when no reminders are due", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);
    enqueueDueTrustedReminderDeliveryJobsMock.mockResolvedValue([]);
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(enqueueDueTrustedReminderDeliveryJobsMock).toHaveBeenCalledWith("2030-01-01T12:15:00.000Z");
    expect(processQueuedRenewalActionRequestNotificationsMock).toHaveBeenCalledWith({ limit: 25 });
    expect(payload.results).toEqual([]);
    expect(payload.renewalActionNotifications).toEqual([]);
    expect(payload.status).toBe("ok");
    expect(payload.failures).toEqual([]);
  });

  it("delegates to the reminder enqueue layer for authorized successful requests", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);
    enqueueDueTrustedReminderDeliveryJobsMock.mockResolvedValue([
      { id: "r1", status: "queued", jobId: "job-1" }
    ]);
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(enqueueDueTrustedReminderDeliveryJobsMock).toHaveBeenCalledTimes(1);
    expect(enqueueDueTrustedReminderDeliveryJobsMock).toHaveBeenCalledWith("2030-01-01T12:15:00.000Z");
    expect(payload.results).toEqual([
      { id: "r1", status: "queued", jobId: "job-1" }
    ]);
    expect(payload.renewalActionNotifications).toEqual([]);
  });

  it("returns queued job results without hiding enqueue state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);
    enqueueDueTrustedReminderDeliveryJobsMock.mockResolvedValue([
      { id: "r1", status: "queued", jobId: "job-1" },
      { id: "r2", status: "queued", jobId: "job-2" }
    ]);
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toEqual([
      { id: "r1", status: "queued", jobId: "job-1" },
      { id: "r2", status: "queued", jobId: "job-2" }
    ]);
  });

  it("surfaces existing job status from the enqueue layer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(frozenNow);
    enqueueDueTrustedReminderDeliveryJobsMock.mockResolvedValue([
      { id: "r2", status: "completed", jobId: "job-2" }
    ]);
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.results).toEqual([
      { id: "r2", status: "completed", jobId: "job-2" }
    ]);
  });

  it("returns a partial failure when reminder processing fails but still processes renewal-action notifications", async () => {
    enqueueDueTrustedReminderDeliveryJobsMock.mockRejectedValue(new Error("db failure"));
    processQueuedRenewalActionRequestNotificationsMock.mockResolvedValue([{ id: "n1", status: "sent" }]);
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        status: "partial_failure",
        results: [],
        renewalActionNotifications: [{ id: "n1", status: "sent" }],
        failures: [
          expect.objectContaining({
            queue: "trusted_reminders",
            code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001"
          })
        ]
      })
    );
    expect(processQueuedRenewalActionRequestNotificationsMock).toHaveBeenCalledWith({ limit: 25 });
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "trusted_reminder_queue_failed",
        metadata: expect.objectContaining({
          code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "trusted_reminder_queue_failed",
        severity: "P1",
        metadata: expect.objectContaining({
          code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001"
        })
      })
    );
  });

  it("returns a partial failure when renewal-action outbox processing fails without hiding reminder results", async () => {
    enqueueDueTrustedReminderDeliveryJobsMock.mockResolvedValue([{ id: "r1", status: "queued", jobId: "job-1" }]);
    processQueuedRenewalActionRequestNotificationsMock.mockRejectedValue(new Error("outbox provider token leaked"));

    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("partial_failure");
    expect(payload.results).toEqual([{ id: "r1", status: "queued", jobId: "job-1" }]);
    expect(payload.failures).toEqual([
      expect.objectContaining({
        queue: "renewal_action_notifications",
        code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001"
      })
    ]);
    expect(JSON.stringify(payload)).not.toContain("provider token");
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "renewal_action_notification_queue_failed",
        metadata: expect.objectContaining({
          code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001"
        })
      })
    );
  });

  it("returns 503 failed when both queues fail with only safe failure codes", async () => {
    enqueueDueTrustedReminderDeliveryJobsMock.mockRejectedValue(new Error("raw contract text should stay hidden"));
    processQueuedRenewalActionRequestNotificationsMock.mockRejectedValue(
      new Error("provider token should stay hidden")
    );

    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      results: [],
      renewalActionNotifications: [],
      status: "failed",
      failures: [
        {
          queue: "trusted_reminders",
          code: "ERR_TRUSTED_REMINDER_QUEUE_FAILED_001"
        },
        {
          queue: "renewal_action_notifications",
          code: "ERR_RENEWAL_ACTION_NOTIFICATION_QUEUE_FAILED_001"
        }
      ]
    });
    expect(JSON.stringify(payload)).not.toMatch(/raw contract text|provider token/i);
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "trusted_reminder_queue_failed",
        severity: "P1"
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "renewal_action_notification_queue_failed",
        severity: "P1"
      })
    );
  });
});
