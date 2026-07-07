import crypto from "crypto";
import { getPaddleConfig, getBillingReturnUrls } from "@/lib/billing/config";
import { getProviderPlanCode, resolvePlanTierForProvider } from "@/lib/billing/plans";
import type {
  BillingCheckoutParams,
  BillingCheckoutSession,
  BillingManagementParams,
  BillingManagementSession,
  BillingProvider,
  BillingWebhookParams,
  BillingWebhookResult
} from "@/lib/billing/types";

type PaddleResponse<T> = { data?: T };

async function paddleRequest<T>(path: string, body: Record<string, unknown>) {
  const config = getPaddleConfig();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Paddle API error (${response.status}): ${message}`);
  }

  return (await response.json()) as PaddleResponse<T>;
}

async function ensureCustomer(params: BillingCheckoutParams) {
  if (params.existingCustomerId) {
    return params.existingCustomerId;
  }

  const response = await paddleRequest<{ id: string }>("/customers", {
    email: params.customer.billingEmail ?? params.customer.email ?? undefined,
    name: params.customer.name ?? undefined,
    custom_data: {
      organization_id: params.organizationId
    }
  });

  const customerId = response.data?.id;
  if (!customerId) {
    throw new Error("Paddle customer creation did not return an id.");
  }

  return customerId;
}

async function createPaddleCheckoutSession(params: BillingCheckoutParams): Promise<BillingCheckoutSession> {
  const customerId = await ensureCustomer(params);
  const planCode = getProviderPlanCode("paddle", params.plan);
  const returnUrls = getBillingReturnUrls();

  const response = await paddleRequest<{
    id: string;
    checkout?: { url?: string | null };
    checkout_url?: string | null;
    url?: string | null;
  }>("/transactions", {
    items: [{ price_id: planCode, quantity: 1 }],
    customer_id: customerId,
    custom_data: {
      organization_id: params.organizationId,
      plan_tier: params.plan
    },
    success_url: params.returnUrl ?? returnUrls.successUrl,
    cancel_url: params.cancelUrl ?? returnUrls.cancelUrl
  });

  const checkoutUrl =
    response.data?.checkout?.url ?? response.data?.checkout_url ?? response.data?.url ?? null;
  if (!checkoutUrl) {
    throw new Error("Paddle checkout session did not return a checkout URL.");
  }

  return {
    url: checkoutUrl,
    provider: "paddle",
    customerId,
    checkoutId: response.data?.id ?? null
  };
}

async function createPaddleManagementSession(
  params: BillingManagementParams
): Promise<BillingManagementSession> {
  if (!params.customerId) {
    return {
      provider: "paddle",
      supported: false,
      reason: "Missing Paddle customer id."
    };
  }

  const returnUrls = getBillingReturnUrls();
  const response = await paddleRequest<{ url?: string | null }>("/portal-sessions", {
    customer_id: params.customerId,
    return_url: params.returnUrl ?? returnUrls.manageReturnUrl
  });

  const url = response.data?.url ?? null;
  if (!url) {
    return {
      provider: "paddle",
      supported: false,
      reason: "Paddle portal session did not return a URL."
    };
  }

  return { provider: "paddle", supported: true, url };
}

function verifyPaddleSignature(body: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(";").map((part) => part.trim());
  const tsPart = parts.find((part) => part.startsWith("ts="));
  const sigPart = parts.find((part) => part.startsWith("h1="));

  if (!tsPart || !sigPart) {
    throw new Error("Invalid Paddle signature header.");
  }

  const ts = tsPart.replace("ts=", "");
  const signature = sigPart.replace("h1=", "");
  const payload = `${ts}:${body}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();

  const signatureBuffer =
    signature.length === 64 ? Buffer.from(signature, "hex") : Buffer.from(signature, "base64");

  if (expected.length !== signatureBuffer.length) {
    throw new Error("Paddle signature mismatch.");
  }

  if (!crypto.timingSafeEqual(expected, signatureBuffer)) {
    throw new Error("Paddle signature mismatch.");
  }
}

async function handlePaddleWebhook(params: BillingWebhookParams): Promise<BillingWebhookResult> {
  const signature =
    params.headers.get("paddle-signature") ?? params.headers.get("Paddle-Signature");

  if (!signature) {
    throw new Error("Missing Paddle signature.");
  }

  const config = getPaddleConfig();
  verifyPaddleSignature(params.body, signature, config.webhookSecret);

  const payload = JSON.parse(params.body) as {
    event_id?: string;
    id?: string;
    event_type?: string;
    eventType?: string;
    data?: Record<string, unknown>;
  };

  const eventType = payload.event_type ?? payload.eventType ?? "unknown";
  const eventKey = payload.event_id ?? payload.id ?? crypto.createHash("sha256").update(params.body).digest("hex");
  const data = (payload.data ?? {}) as Record<string, unknown>;

  const customerId =
    (data.customer_id as string | undefined) ??
    ((data.customer as Record<string, unknown> | undefined)?.id as string | undefined) ??
    null;

  const subscriptionId =
    (data.subscription_id as string | undefined) ??
    ((data.subscription as Record<string, unknown> | undefined)?.id as string | undefined) ??
    ((data as Record<string, unknown>)?.id as string | undefined) ??
    null;

  const items = (data.items as Array<Record<string, unknown>> | undefined) ?? [];
  const firstPriceId =
    (items[0]?.price_id as string | undefined) ??
    ((items[0]?.price as Record<string, unknown> | undefined)?.id as string | undefined) ??
    null;

  const planCode =
    (data.price_id as string | undefined) ??
    firstPriceId ??
    ((data.subscription as Record<string, unknown> | undefined)?.price_id as string | undefined) ??
    null;

  const status =
    (data.status as string | undefined) ??
    ((data.subscription as Record<string, unknown> | undefined)?.status as string | undefined) ??
    null;

  const currentPeriodEnd =
    (data.current_billing_period_end_at as string | undefined) ??
    ((data.current_billing_period as Record<string, unknown> | undefined)?.ends_at as
      | string
      | undefined) ??
    null;

  const customData =
    (data.custom_data as Record<string, unknown> | undefined) ??
    ((data.subscription as Record<string, unknown> | undefined)?.custom_data as
      | Record<string, unknown>
      | undefined) ??
    ((data.customer as Record<string, unknown> | undefined)?.custom_data as
      | Record<string, unknown>
      | undefined) ??
    null;

  const organizationId =
    (customData?.organization_id as string | undefined) ??
    (customData?.organizationId as string | undefined) ??
    null;

  const planTier = resolvePlanTierForProvider("paddle", planCode);

  return {
    provider: "paddle",
    eventType,
    eventKey,
    organizationId,
    customerId,
    subscriptionId,
    planTier,
    planCode,
    priceId: planCode,
    status,
    currentPeriodEnd,
    raw: payload
  };
}

export const paddleProvider: BillingProvider = {
  name: "paddle",
  isConfigured: () => true,
  createCheckoutSession: createPaddleCheckoutSession,
  createManagementSession: createPaddleManagementSession,
  handleWebhook: handlePaddleWebhook
};
