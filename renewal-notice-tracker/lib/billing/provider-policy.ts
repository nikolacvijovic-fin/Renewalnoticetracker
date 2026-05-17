import type { BillingProviderName, BillingProviderState } from "@/lib/billing/types";

type BillingProviderPolicy = {
  provider: BillingProviderName;
  state: BillingProviderState;
  label: string;
  checkoutSupported: boolean;
  managementSupported: boolean;
  customerMessage: string;
};

export const BILLING_PROVIDER_POLICY: Record<BillingProviderName, BillingProviderPolicy> = {
  paddle: {
    provider: "paddle",
    state: "active_self_serve",
    label: "Paddle",
    checkoutSupported: true,
    managementSupported: true,
    customerMessage: "Paddle is the only shipped-first self-serve billing provider."
  },
  manual: {
    provider: "manual",
    state: "internal_exception",
    label: "Manual invoice exception",
    checkoutSupported: false,
    managementSupported: false,
    customerMessage: "Manual invoice exceptions are support-led and are not self-serve in shipped-first runtime."
  },
  paypal: {
    provider: "paypal",
    state: "legacy_disabled",
    label: "Legacy billing migration",
    checkoutSupported: false,
    managementSupported: false,
    customerMessage: "PayPal is disabled in shipped-first runtime and only remains as legacy migration history."
  },
  stripe: {
    provider: "stripe",
    state: "legacy_disabled",
    label: "Legacy billing migration",
    checkoutSupported: false,
    managementSupported: false,
    customerMessage: "Stripe is disabled in shipped-first runtime and only remains as legacy migration history."
  }
};

export function parseBillingProviderName(value: string | null | undefined): BillingProviderName | null {
  if (!value) return null;
  return value in BILLING_PROVIDER_POLICY ? (value as BillingProviderName) : null;
}

export function getBillingProviderPolicy(
  provider: BillingProviderName | string | null | undefined
): BillingProviderPolicy {
  const normalized = parseBillingProviderName(typeof provider === "string" ? provider : provider ?? null);
  return BILLING_PROVIDER_POLICY[normalized ?? "manual"];
}

export function getCustomerBillingProvider(
  provider: BillingProviderName | string | null | undefined
): BillingProviderName {
  const policy = getBillingProviderPolicy(provider);
  return policy.provider === "paddle" ? "paddle" : "manual";
}
