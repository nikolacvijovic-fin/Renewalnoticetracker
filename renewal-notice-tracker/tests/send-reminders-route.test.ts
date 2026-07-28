import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueDueTrustedReminderDeliveryJobsMock = vi.fn();
const logServerError = vi.fn();
const logServerWarn = vi.fn();
const emitOperationalEvent = vi.fn();
const frozenNow = new Date("2030-01-01T12:00:00.000Z");
let POST: (request: Request) => Promise<Response>;

vi.mock("@/lib/notifications/reminders", () => ({
  enqueueDueTrustedReminderDeliveryJobs: enqueueDueTrustedReminderDeliveryJobsMock
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
    enqueueDueTrustedReminderDeliveryJobsMock.mockReset();
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
    expect(payload.results).toEqual([]);
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

  it("returns a generic error when reminder processing fails", async () => {
    enqueueDueTrustedReminderDeliveryJobsMock.mockRejectedValue(new Error("db failure"));
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Reminder processing failed.",
        code: "ERR_REMINDER_PROCESSING_FAILED_001",
        requestId: expect.any(String)
      })
    );
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "reminder_dispatch_failed",
        metadata: expect.objectContaining({
          code: "ERR_REMINDER_PROCESSING_FAILED_001",
          status: 500
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "reminder_dispatch_failed",
        severity: "P1",
        metadata: expect.objectContaining({
          code: "ERR_REMINDER_PROCESSING_FAILED_001",
          status: 500
        })
      })
    );
  });
});
