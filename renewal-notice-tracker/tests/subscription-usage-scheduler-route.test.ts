import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const processDue = vi.fn();
let POST: (request: Request) => Promise<Response>;

vi.mock("@/lib/subscription-usage/scheduled-sync", () => ({
  processDueSubscriptionUsageConnections: processDue
}));

vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({
    internal: { cronSharedSecret: "scheduler-secret" },
    operations: {
      monitoringEventSink: "structured_log",
      monitoringAlertWebhookUrl: null,
      monitoringAlertWebhookSigningSecret: null,
      monitoringAlertWebhookTimeoutMs: 2500,
      monitoringAlertWebhookDeliveryMode: "await"
    }
  })
}));

describe("subscription usage scheduler route", () => {
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/cron/subscription-usage-sync/route"));
  });

  beforeEach(() => {
    processDue.mockReset();
  });

  it("rejects missing and invalid scheduler authentication", async () => {
    for (const secret of [undefined, "wrong-secret"]) {
      const response = await POST(new Request("http://localhost/api/cron/subscription-usage-sync", {
        method: "POST",
        headers: secret ? { "x-cron-secret": secret } : undefined
      }));
      expect(response.status).toBe(401);
    }
    expect(processDue).not.toHaveBeenCalled();
  });

  it("runs without a user session when the cron secret is valid", async () => {
    processDue.mockResolvedValue({ claimed: 2, completed: 1, failed: 1, skipped: 0 });
    const response = await POST(new Request("http://localhost/api/cron/subscription-usage-sync", {
      method: "POST",
      headers: { "x-cron-secret": "scheduler-secret" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 2, completed: 1, failed: 1, skipped: 0 });
    expect(processDue).toHaveBeenCalledTimes(1);
  });
});
