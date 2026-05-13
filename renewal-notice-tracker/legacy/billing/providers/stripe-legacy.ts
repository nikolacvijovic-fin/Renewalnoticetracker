import { headers } from "next/headers";
import { getStripeLegacyConfig, getBillingReturnUrls } from "@/legacy/billing/config";
import { resolvePlanTierForProvider } from "@/legacy/billing/plans";
import type {
  BillingCheckoutParams,
  BillingCheckoutSession,
  BillingManagementParams,
  BillingManagementSession,
  BillingProvider,
  BillingWebhookParams,
  BillingWebhookResult
} from "@/lib/billing/types";

type StripeCustomer = { id: string };
type StripeCheckoutSession = { id: string; url?: string | null };
type StripeBillingPortalSession = { url: string };
type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      customer?: string;
      subscription?: string;
      status?: string;
      current_period_end?: number;
      metadata?: Record<string, string>;
      items?: { data: Array<{ price: { id: string } }> };
    };
  };
};

type StripeClient = {
  customers: {
    create: (input: {
      email?: string;
      name?: string;
      metadata: { organization_id: string };
    }) => Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create: (input: {
        mode: "subscription";
        customer: string;
        line_items: Array<{ price: string; quantity: number }>;
        success_url: string;
        cancel_url: string;
        metadata: { organization_id: string; plan: string };
      }) => Promise<StripeCheckoutSession>;
    };
  };
  billingPortal: {
    sessions: {
      create: (input: {
        customer: string;
        return_url: string;
      }) => Promise<StripeBillingPortalSession>;
    };
  };
  webhooks: {
    constructEvent: (body: string, signature: string, webhookSecret: string) => StripeWebhookEvent;
  };
};

async function getStripeClient(): Promise<StripeClient> {
  void getStripeLegacyConfig();
  throw new Error(
    "Stripe legacy runtime is archived. Reinstall the stripe package and restore the historical implementation if a migration requires it."
  );
}

async function createStripeCheckoutSession(
  params: BillingCheckoutParams
): Promise<BillingCheckoutSession> {
  const stripe = await getStripeClient();
  const config = getStripeLegacyConfig();
  const returnUrls = getBillingReturnUrls();
  const customer = params.existingCustomerId
    ? params.existingCustomerId
    : (
        await stripe.customers.create({
          email: params.customer.billingEmail ?? params.customer.email ?? undefined,
          name: params.customer.name ?? undefined,
          metadata: {
            organization_id: params.organizationId
          }
        })
      ).id;

  const priceId = params.plan === "starter" ? config.starterPriceId : config.growthPriceId;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.returnUrl ?? returnUrls.successUrl,
    cancel_url: params.cancelUrl ?? returnUrls.cancelUrl,
    metadata: { organization_id: params.organizationId, plan: params.plan }
  });

  if (!session.url) {
    throw new Error("Stripe checkout did not return a session URL.");
  }

  return {
    url: session.url,
    provider: "stripe",
    customerId: customer,
    checkoutId: session.id
  };
}

async function createStripeManagementSession(
  params: BillingManagementParams
): Promise<BillingManagementSession> {
  if (!params.customerId) {
    return { provider: "stripe", supported: false, reason: "Missing Stripe customer id." };
  }
  const stripe = await getStripeClient();
  const returnUrls = getBillingReturnUrls();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl ?? returnUrls.manageReturnUrl
  });

  return { provider: "stripe", supported: true, url: session.url };
}

async function handleStripeWebhook(params: BillingWebhookParams): Promise<BillingWebhookResult> {
  const signature =
    params.headers.get("stripe-signature") ?? headers().get("stripe-signature") ?? null;
  if (!signature) {
    throw new Error("Missing Stripe signature.");
  }

  const config = getStripeLegacyConfig();
  const stripe = await getStripeClient();
  let event: StripeWebhookEvent;
  try {
    event = stripe.webhooks.constructEvent(params.body, signature, config.webhookSecret);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Invalid Stripe signature");
  }

  const object = event.data.object as {
    id?: string;
    customer?: string;
    subscription?: string;
    status?: string;
    current_period_end?: number;
    metadata?: Record<string, string>;
    items?: { data: Array<{ price: { id: string } }> };
  };

  const priceId = object.items?.data[0]?.price.id ?? null;
  const planTier = resolvePlanTierForProvider("stripe", priceId);

  return {
    provider: "stripe",
    eventType: event.type,
    eventKey: event.id,
    organizationId: object.metadata?.organization_id ?? null,
    customerId: typeof object.customer === "string" ? object.customer : null,
    subscriptionId: typeof object.subscription === "string" ? object.subscription : object.id ?? null,
    planTier,
    planCode: priceId,
    priceId,
    status: typeof object.status === "string" ? object.status : null,
    currentPeriodEnd:
      typeof object.current_period_end === "number"
        ? new Date(object.current_period_end * 1000).toISOString()
        : null,
    raw: event
  };
}

export const stripeLegacyProvider: BillingProvider = {
  name: "stripe",
  isConfigured: () => true,
  createCheckoutSession: createStripeCheckoutSession,
  createManagementSession: createStripeManagementSession,
  handleWebhook: handleStripeWebhook
};
