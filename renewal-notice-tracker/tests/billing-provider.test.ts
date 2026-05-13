import { beforeEach, describe, expect, it, vi } from "vitest";

const baseBilling = {
  billing_provider: null,
  billing_customer_id: null,
  billing_subscription_id: null,
  stripe_customer_id: null,
  stripe_subscription_id: null
};

describe("billing provider resolution", () => {
  beforeEach(() => {
    process.env.BILLING_PROVIDER_DEFAULT = "paddle";
    process.env.PADDLE_API_KEY = "paddle-key";
    process.env.PADDLE_WEBHOOK_SECRET = "paddle-secret";
    process.env.PADDLE_STARTER_PRICE_ID = "price_starter";
    process.env.PADDLE_GROWTH_PRICE_ID = "price_growth";
    vi.resetModules();
  });

  it("keeps Paddle as the shipped-first checkout provider", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider({ ...baseBilling, billing_provider: "paypal" }, undefined);
    expect(provider).toBe("paddle");
  });

  it("ignores legacy stripe fallback for shipped-first checkout routing", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider({ ...baseBilling, stripe_customer_id: "cus_legacy" }, undefined);
    expect(provider).toBe("paddle");
  });

  it("uses the configured default when no provider is set", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider(baseBilling, undefined);
    expect(provider).toBe("paddle");
  });

  it("labels providers consistently", async () => {
    const { getBillingProviderLabel } = await import("@/lib/billing/provider");
    expect(getBillingProviderLabel("paddle")).toBe("Paddle");
    expect(getBillingProviderLabel("paypal")).toBe("Manual invoice or legacy migration");
    expect(getBillingProviderLabel("stripe")).toBe("Manual invoice or legacy migration");
  });

  it("quarantines legacy provider capabilities from shipped-first self-serve billing", async () => {
    const { getBillingProviderCapability } = await import("@/lib/billing/provider");
    expect(getBillingProviderCapability("paypal").management.supported).toBe(false);
    expect(getBillingProviderCapability("paypal").checkout.supported).toBe(false);
    expect(getBillingProviderCapability("paddle").management.supported).toBe(true);
  });
});
