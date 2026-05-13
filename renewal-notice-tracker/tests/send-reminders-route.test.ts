import { beforeEach, describe, expect, it, vi } from "vitest";

const processDueRemindersMock = vi.fn();

vi.mock("@/lib/notifications/reminders", () => ({
  processDueReminders: processDueRemindersMock
}));

describe("send reminders cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.CRON_SHARED_SECRET = "test-secret";
  });

  it(
    "rejects requests without the cron secret header",
    async () => {
      const { POST } = await import("@/app/api/cron/send-reminders/route");
      const response = await POST(
        new Request("http://localhost/api/cron/send-reminders", {
          method: "POST"
        })
      );

      expect(response.status).toBe(401);
      expect(processDueRemindersMock).not.toHaveBeenCalled();
    },
    15000
  );

  it("rejects unauthorized requests", async () => {
    const { POST } = await import("@/app/api/cron/send-reminders/route");
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "wrong-secret"
        }
      })
    );

    expect(response.status).toBe(401);
    expect(processDueRemindersMock).not.toHaveBeenCalled();
  });

  it("delegates to the reminder processor for authorized requests", async () => {
    processDueRemindersMock.mockResolvedValue([{ id: "r1", status: "sent" }]);
    const { POST } = await import("@/app/api/cron/send-reminders/route");
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
    expect(processDueRemindersMock).toHaveBeenCalledTimes(1);
    expect(payload.results).toEqual([{ id: "r1", status: "sent" }]);
  });

  it("returns a generic error when reminder processing fails", async () => {
    processDueRemindersMock.mockRejectedValue(new Error("db failure"));
    const { POST } = await import("@/app/api/cron/send-reminders/route");
    const response = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: {
          "x-cron-secret": "test-secret"
        }
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Reminder processing failed."
    });
  });
});
