import { Buffer } from "buffer";
import { getPayPalConfig, getBillingReturnUrls } from "@/legacy/billing/config";
import { getProviderPlanCode, resolvePlanTierForProvider } from "@/legacy/billing/plans";
import type {
  BillingCheckoutParams,
  BillingCheckoutSession,
  BillingManagementParams,
  BillingManagementSession,
  BillingProvider,
  BillingWebhookParams,
  BillingWebhookResult
} from "@/lib/billing/types";

type PayPalTokenResponse = { access_token: string };

async function getPayPalAccessToken() {
  const config = getPayPalConfig();
  const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  const response = await fetch(`${config.apiBaseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`PayPal auth error (${response.status}): ${message}`);
  }

  const data = (await response.json()) as PayPalTokenResponse;
  return data.access_token;
}

async function paypalRequest<T>(path: string, body: Record<string, unknown>) {
  const config = getPayPalConfig();
  const token = await getPayPalAccessToken();
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`PayPal API error (${response.status}): ${message}`);
  }

  return (await response.json()) as T;
}

async function createPayPalCheckoutSession(
  params: BillingCheckoutParams
): Promise<BillingCheckoutSession> {
  const planCode = getProviderPlanCode("paypal", params.plan);
  const returnUrls = getBillingReturnUrls();

  const response = await paypalRequest<{
    id: string;
    links?: Array<{ rel: string; href: string }>;
  }>("/v1/billing/subscriptions", {
    plan_id: planCode,
    custom_id: params.organizationId,
    subscriber: {
      email_address: params.customer.billingEmail ?? params.customer.email ?? undefined
    },
    application_context: {
      return_url: params.returnUrl ?? returnUrls.successUrl,
      cancel_url: params.cancelUrl ?? returnUrls.cancelUrl,
      user_action: "SUBSCRIBE",
      brand_name: "Renewal Notice Tracker"
    }
  });

  const approveUrl = response.links?.find((link) => link.rel === "approve")?.href ?? null;
  if (!approveUrl) {
    throw new Error("PayPal checkout did not return an approval URL.");
  }

  return {
    url: approveUrl,
    provider: "paypal",
    checkoutId: response.id ?? null
  };
}

async function createPayPalManagementSession(
  params: BillingManagementParams
): Promise<BillingManagementSession> {
  void params;
  return {
    provider: "paypal",
    supported: false,
    reason: "PayPal does not provide a self-serve portal in this integration."
  };
}

async function verifyPayPalSignature(
  body: string,
  headers: Headers
): Promise<void> {
  const config = getPayPalConfig();
  const authAlgo = headers.get("paypal-auth-algo");
  const certUrl = headers.get("paypal-cert-url");
  const transmissionId = headers.get("paypal-transmission-id");
  const transmissionSig = headers.get("paypal-transmission-sig");
  const transmissionTime = headers.get("paypal-transmission-time");

  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    throw new Error("Missing PayPal webhook signature headers.");
  }

  const payload = JSON.parse(body) as Record<string, unknown>;

  const verification = await paypalRequest<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: config.webhookId,
      webhook_event: payload
    }
  );

  if (verification.verification_status !== "SUCCESS") {
    throw new Error("PayPal webhook signature verification failed.");
  }
}

function normalizePayPalStatus(status: string | null) {
  if (!status) return null;
  return status.toLowerCase();
}

async function handlePayPalWebhook(params: BillingWebhookParams): Promise<BillingWebhookResult> {
  await verifyPayPalSignature(params.body, params.headers);
  const payload = JSON.parse(params.body) as {
    event_type?: string;
    resource?: Record<string, unknown>;
  };

  const eventType = payload.event_type ?? "unknown";
  const resource = payload.resource ?? {};
  const eventKey = params.headers.get("paypal-transmission-id") ?? null;

  const organizationId =
    (resource.custom_id as string | undefined) ??
    (resource.customId as string | undefined) ??
    null;

  const subscriptionId = (resource.id as string | undefined) ?? null;
  const customerId =
    ((resource.subscriber as Record<string, unknown> | undefined)?.payer_id as
      | string
      | undefined) ?? null;
  const planCode = (resource.plan_id as string | undefined) ?? null;
  const status = normalizePayPalStatus((resource.status as string | undefined) ?? null);

  const currentPeriodEnd =
    ((resource.billing_info as Record<string, unknown> | undefined)?.next_billing_time as
      | string
      | undefined) ?? null;

  const planTier = resolvePlanTierForProvider("paypal", planCode);

  return {
    provider: "paypal",
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

export const payPalProvider: BillingProvider = {
  name: "paypal",
  isConfigured: () => true,
  createCheckoutSession: createPayPalCheckoutSession,
  createManagementSession: createPayPalManagementSession,
  handleWebhook: handlePayPalWebhook
};
