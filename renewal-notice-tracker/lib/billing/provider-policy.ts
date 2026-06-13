import type { BillingProviderName, BillingProviderState } from "@/lib/billing/types";

type BillingProviderPolicy = {
  provider: BillingProviderName;
  state: BillingProviderState;
  label: string;
  checkoutSupported: boolean;
  managementSupported: boolean;
  publicCheckoutAllowed: boolean;
  requiresExplicitSupportSetup: boolean;
  customerMessage: string;
};

export const BILLING_PROVIDER_POLICY: Record<BillingProviderName, BillingProviderPolicy> = {
  paddle: {
    provider: "paddle",
    state: "active_self_serve",
    label: "Paddle",
    checkoutSupported: true,
    managementSupported: true,
    publicCheckoutAllowed: true,
    requiresExplicitSupportSetup: false,
    customerMessage: "Paddle is the only shipped-first self-serve billing provider."
  },
  manual: {
    provider: "manual",
    state: "support_led_exception",
    label: "Manual invoice / wire transfer exception",
    checkoutSupported: false,
    managementSupported: false,
    publicCheckoutAllowed: false,
    requiresExplicitSupportSetup: true,
    customerMessage:
      "Manual invoice and wire transfer billing are support-led exceptions. Contact support for billing changes."
  },
  paypal: {
    provider: "paypal",
    state: "support_led_exception",
    label: "PayPal support-led exception",
    checkoutSupported: false,
    managementSupported: false,
    publicCheckoutAllowed: false,
    requiresExplicitSupportSetup: true,
    customerMessage:
      "PayPal billing is available only as a support-led exception and does not include a self-serve billing portal."
  },
  stripe: {
    provider: "stripe",
    state: "legacy_migration_only",
    label: "Legacy Stripe migration-only",
    checkoutSupported: false,
    managementSupported: false,
    publicCheckoutAllowed: false,
    requiresExplicitSupportSetup: false,
    customerMessage: "Legacy Stripe billing is migration-only and inactive in shipped runtime."
  }
};

export function parseBillingProviderName(value: string | null | undefined): BillingProviderName | null {
  if (!value) return null;
  return value in BILLING_PROVIDER_POLICY ? (value as BillingProviderName) : null;
}

export function getBillingProviderPolicy(
  provider: BillingProviderName | string | null | undefined
): BillingProviderPolicy {
  if (!provider) return BILLING_PROVIDER_POLICY.paddle;
  const normalized = parseBillingProviderName(provider);
  return BILLING_PROVIDER_POLICY[normalized ?? "manual"];
}

export function getCustomerBillingProvider(
  provider: BillingProviderName | string | null | undefined
): BillingProviderName {
  const policy = getBillingProviderPolicy(provider);
  return policy.provider;
}

export function isSupportLedBillingProvider(provider: BillingProviderName | string | null | undefined) {
  return getBillingProviderPolicy(provider).state === "support_led_exception";
}

export function isSelfServeBillingProvider(provider: BillingProviderName | string | null | undefined) {
  return getBillingProviderPolicy(provider).state === "active_self_serve";
}
