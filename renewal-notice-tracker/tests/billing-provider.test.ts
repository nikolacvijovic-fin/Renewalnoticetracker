import { beforeEach, describe, expect, it, vi } from "vitest";

const baseBilling = {
  billing_provider: null,
  billing_customer_id: null,
  billing_subscription_id: null
};

describe("billing provider resolution", () => {
  beforeEach(() => {
    process.env.PADDLE_API_KEY = "paddle-key";
    process.env.PADDLE_WEBHOOK_SECRET = "paddle-secret";
    process.env.PADDLE_STARTER_PRICE_ID = "price_starter";
    process.env.PADDLE_GROWTH_PRICE_ID = "price_growth";
    vi.resetModules();
  });

  it("keeps Paddle as the self-serve checkout provider even for support-led exception orgs", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider({ ...baseBilling, billing_provider: "paypal" }, undefined);
    expect(provider).toBe("paddle");
  });

  it("ignores legacy stripe fallback for shipped-first checkout routing", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider(baseBilling, undefined);
    expect(provider).toBe("paddle");
  });

  it("uses the configured default when no provider is set", async () => {
    const { resolveBillingProvider } = await import("@/lib/billing/provider");
    const provider = resolveBillingProvider(baseBilling, undefined);
    expect(provider).toBe("paddle");
  });

  it("shows Paddle as the default customer billing provider when none is configured", async () => {
    const { getCustomerBillingProvider } = await import("@/lib/billing/provider-policy");
    expect(getCustomerBillingProvider(null)).toBe("paddle");
  });

  it("labels providers consistently", async () => {
    const { getBillingProviderLabel } = await import("@/lib/billing/provider");
    expect(getBillingProviderLabel("paddle")).toBe("Paddle");
    expect(getBillingProviderLabel("manual")).toBe("Manual invoice / wire transfer exception");
    expect(getBillingProviderLabel("paypal")).toBe("PayPal support-led exception");
    expect(getBillingProviderLabel("stripe")).toBe("Legacy Stripe migration-only");
  });

  it("quarantines non-Paddle provider capabilities from shipped-first self-serve billing", async () => {
    const { getBillingProviderCapability } = await import("@/lib/billing/provider");
    expect(getBillingProviderCapability("manual").management.supported).toBe(false);
    expect(getBillingProviderCapability("manual").checkout.supported).toBe(false);
    expect(getBillingProviderCapability("paypal").management.supported).toBe(false);
    expect(getBillingProviderCapability("paddle").management.supported).toBe(true);
  });

  it("encodes canonical provider states for shipped-first billing", async () => {
    const { getBillingProviderPolicy } = await import("@/lib/billing/provider-policy");
    expect(getBillingProviderPolicy("paddle").state).toBe("active_self_serve");
    expect(getBillingProviderPolicy("manual").state).toBe("support_led_exception");
    expect(getBillingProviderPolicy("paypal").state).toBe("support_led_exception");
    expect(getBillingProviderPolicy("stripe").state).toBe("legacy_migration_only");
  });

  it("keeps support-led providers out of public self-serve checkout", async () => {
    const { getBillingProviderPolicy } = await import("@/lib/billing/provider-policy");
    expect(getBillingProviderPolicy("paypal").publicCheckoutAllowed).toBe(false);
    expect(getBillingProviderPolicy("manual").publicCheckoutAllowed).toBe(false);
    expect(getBillingProviderPolicy("paypal").requiresExplicitSupportSetup).toBe(true);
    expect(getBillingProviderPolicy("manual").requiresExplicitSupportSetup).toBe(true);
    expect(getBillingProviderPolicy("paddle").publicCheckoutAllowed).toBe(true);
  });
});
