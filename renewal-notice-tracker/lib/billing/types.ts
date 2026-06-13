export const BILLING_PROVIDERS = ["paddle", "manual", "paypal", "stripe"] as const;

export type BillingProviderName = (typeof BILLING_PROVIDERS)[number];
export type BillingProviderState =
  | "active_self_serve"
  | "support_led_exception"
  | "legacy_migration_only"
  | "disabled";

export type PlanTier = "starter" | "growth";

export type BillingCheckoutParams = {
  organizationId: string;
  plan: PlanTier;
  customer: {
    email?: string | null;
    name?: string | null;
    billingEmail?: string | null;
  };
  returnUrl?: string;
  cancelUrl?: string;
  existingCustomerId?: string | null;
  providerOverride?: BillingProviderName;
};

export type BillingCheckoutSession = {
  url: string;
  provider: BillingProviderName;
  customerId?: string | null;
  checkoutId?: string | null;
};

export type BillingManagementParams = {
  organizationId: string;
  customerId?: string | null;
  returnUrl?: string;
  providerOverride?: BillingProviderName;
};

export type BillingManagementSession = {
  provider: BillingProviderName;
  supported: boolean;
  url?: string | null;
  reason?: string;
};

export type BillingProviderCapability = {
  checkout: {
    supported: boolean;
    message: string;
  };
  management: {
    supported: boolean;
    message: string;
  };
};

export type BillingWebhookParams = {
  body: string;
  headers: Headers;
};

export type NormalizedBillingState = {
  billing_provider: BillingProviderName;
  billing_customer_id: string | null;
  billing_subscription_id: string | null;
  billing_plan_code: string | null;
  billing_price_id: string | null;
  billing_subscription_status: string | null;
  billing_current_period_end: string | null;
  plan_tier: PlanTier;
  subscription_status: string;
  subscription_current_period_end: string | null;
};

export type BillingWebhookResult = {
  provider: BillingProviderName;
  eventType: string;
  eventKey?: string | null;
  organizationId?: string | null;
  customerId?: string | null;
  subscriptionId?: string | null;
  planTier?: PlanTier | null;
  planCode?: string | null;
  priceId?: string | null;
  status?: string | null;
  currentPeriodEnd?: string | null;
  raw?: unknown;
};

export type BillingProvider = {
  name: BillingProviderName;
  isConfigured: () => boolean;
  createCheckoutSession: (params: BillingCheckoutParams) => Promise<BillingCheckoutSession>;
  createManagementSession: (params: BillingManagementParams) => Promise<BillingManagementSession>;
  handleWebhook: (params: BillingWebhookParams) => Promise<BillingWebhookResult>;
};
