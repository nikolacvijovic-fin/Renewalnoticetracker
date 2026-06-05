import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logServerError = vi.fn();
const logServerWarn = vi.fn();
const emitOperationalEvent = vi.fn();

vi.mock("@/lib/observability/server-logger", () => ({
  logServerError,
  logServerWarn,
  sanitizeOperationalError: (error: unknown) =>
    error instanceof Error ? { name: error.name, message: "[REDACTED]" } : error
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

describe("billing webhooks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    emitOperationalEvent.mockResolvedValue({});
    process.env.PADDLE_API_KEY = "paddle-key";
    process.env.PADDLE_WEBHOOK_SECRET = "paddle-secret";
    process.env.PADDLE_ENVIRONMENT = "sandbox";
    process.env.PADDLE_STARTER_PRICE_ID = "price_starter";
    process.env.PADDLE_GROWTH_PRICE_ID = "price_growth";
  });

  it("maps Paddle webhook payloads to normalized billing state", async () => {
    const { handleWebhook } = await import("@/lib/billing/provider");

    const body = JSON.stringify({
      event_type: "subscription.updated",
      data: {
        customer_id: "cus_paddle",
        subscription_id: "sub_paddle",
        items: [{ price_id: "price_growth" }],
        status: "active",
        current_billing_period: { ends_at: "2099-01-01T00:00:00.000Z" },
        custom_data: { organization_id: "org_1" }
      }
    });

    const ts = `${Math.floor(Date.now() / 1000)}`;
    const signature = crypto
      .createHmac("sha256", process.env.PADDLE_WEBHOOK_SECRET ?? "")
      .update(`${ts}:${body}`)
      .digest("hex");

    const headers = new Headers({
      "paddle-signature": `ts=${ts};h1=${signature}`
    });

    const result = await handleWebhook("paddle", { body, headers });

    expect(result.provider).toBe("paddle");
    expect(result.organizationId).toBe("org_1");
    expect(result.customerId).toBe("cus_paddle");
    expect(result.subscriptionId).toBe("sub_paddle");
    expect(result.planTier).toBe("growth");
    expect(result.currentPeriodEnd).toBe("2099-01-01T00:00:00.000Z");
  });

  it("rejects legacy provider webhook handling in shipped-first runtime", async () => {
    const { handleWebhook } = await import("@/lib/billing/provider");

    await expect(
      handleWebhook("paypal", { body: "{}", headers: new Headers() })
    ).rejects.toThrow("Legacy billing webhooks are disabled in shipped-first runtime.");
    await expect(
      handleWebhook("stripe", { body: "{}", headers: new Headers() })
    ).rejects.toThrow("Legacy billing webhooks are disabled in shipped-first runtime.");
  });

  it("quarantines legacy public webhook routes", async () => {
    const payPalRoute = await import("@/app/api/webhooks/billing/paypal/route");
    const stripeRoute = await import("@/app/api/webhooks/stripe/route");

    const payPalResponse = await payPalRoute.POST(
      new Request("http://localhost/api/webhooks/billing/paypal", { method: "POST" })
    );
    const stripeResponse = await stripeRoute.POST(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST" })
    );

    expect(payPalResponse.status).toBe(410);
    expect(stripeResponse.status).toBe(410);
  });

  it("emits safe received and succeeded events for verified Paddle webhooks", async () => {
    vi.doMock("@/lib/billing/provider", () => ({
      handleWebhook: vi.fn().mockResolvedValue({
        provider: "paddle",
        eventType: "subscription.updated",
        organizationId: "org-1",
        customerId: "cus_1",
        subscriptionId: "sub_1",
        status: "active",
        raw: {
          provider_payload: "raw billing payload should not be emitted"
        }
      })
    }));
    vi.doMock("@/lib/billing/service", () => ({
      persistBillingWebhookUpdate: vi.fn().mockResolvedValue({
        updated: true,
        organizationId: "org-1"
      })
    }));

    const paddleRoute = await import("@/app/api/webhooks/billing/paddle/route");
    const response = await paddleRoute.POST(
      new Request("http://localhost/api/webhooks/billing/paddle", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(200);
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_webhook_received",
        severity: "P3",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          provider: "paddle",
          event_type: "subscription.updated",
          organization_resolved: true
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_webhook_succeeded",
        severity: "P3",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          provider: "paddle",
          event_type: "subscription.updated",
          updated: true,
          duplicate: false
        })
      })
    );
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain(
      "raw billing payload should not be emitted"
    );

    vi.doUnmock("@/lib/billing/provider");
    vi.doUnmock("@/lib/billing/service");
  });

  it("emits a safe replay event for duplicate Paddle webhook receipts", async () => {
    vi.doMock("@/lib/billing/provider", () => ({
      handleWebhook: vi.fn().mockResolvedValue({
        provider: "paddle",
        eventType: "subscription.updated",
        organizationId: "org-1",
        raw: {}
      })
    }));
    vi.doMock("@/lib/billing/service", () => ({
      persistBillingWebhookUpdate: vi.fn().mockResolvedValue({
        updated: false,
        duplicate: true,
        organizationId: "org-1"
      })
    }));

    const paddleRoute = await import("@/app/api/webhooks/billing/paddle/route");
    const response = await paddleRoute.POST(
      new Request("http://localhost/api/webhooks/billing/paddle", {
        method: "POST",
        body: "{}"
      })
    );

    expect(response.status).toBe(200);
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_webhook_replayed",
        severity: "P3",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          provider: "paddle",
          duplicate: true
        })
      })
    );

    vi.doUnmock("@/lib/billing/provider");
    vi.doUnmock("@/lib/billing/service");
  });

  it("returns a safe error and logs a named event when Paddle webhook processing fails", async () => {
    const paddleRoute = await import("@/app/api/webhooks/billing/paddle/route");
    const response = await paddleRoute.POST(
      new Request("http://localhost/api/webhooks/billing/paddle", {
        method: "POST",
        body: JSON.stringify({
          provider_payload: "raw provider payload should not be surfaced"
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        error: "Invalid webhook",
        code: "ERR_WEBHOOK_INVALID_001",
        requestId: expect.any(String)
      })
    );
    expect(JSON.stringify(body)).not.toContain("raw provider payload");
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "billing_webhook_failed",
        metadata: expect.objectContaining({
          provider: "paddle",
          code: "ERR_WEBHOOK_INVALID_001",
          status: 400
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "billing_webhook_failed",
        severity: "P1",
        sensitivity: "restricted",
        alert: true,
        metadata: expect.objectContaining({
          provider: "paddle",
          code: "ERR_WEBHOOK_INVALID_001",
          status: 400
        }),
        error: {
          name: "Error",
          message: "[REDACTED]"
        }
      })
    );
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain("raw provider payload");
  });
});
