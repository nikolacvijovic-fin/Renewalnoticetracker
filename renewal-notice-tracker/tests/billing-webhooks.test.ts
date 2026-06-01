import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("billing webhooks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
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
});
