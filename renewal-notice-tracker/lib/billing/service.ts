import crypto from "node:crypto";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import {
  createCheckoutSession,
  createCustomerManagementSession,
  resolveBillingProvider
} from "@/lib/billing/provider";
import { getProviderPlanCode } from "@/lib/billing/plans";
import type { BillingProviderName, BillingWebhookResult } from "@/lib/billing/types";

function hashWebhookPayload(raw: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(raw ?? null)).digest("hex");
}

function normalizeBillingStatus(status: string | null | undefined) {
  return status?.toLowerCase() ?? null;
}

function shouldApplyBillingUpdate(input: {
  currentStatus: string | null | undefined;
  incomingStatus: string | null | undefined;
  currentPeriodEnd: string | null | undefined;
  incomingPeriodEnd: string | null | undefined;
}) {
  const currentStatus = normalizeBillingStatus(input.currentStatus);
  const incomingStatus = normalizeBillingStatus(input.incomingStatus);

  if (!incomingStatus) return true;
  if (!currentStatus) return true;
  if (currentStatus === incomingStatus) return true;

  if (currentStatus === "cancelled" && incomingStatus !== "cancelled") {
    return false;
  }

  if (currentStatus === "active" && incomingStatus === "trialing") {
    return false;
  }

  if (input.currentPeriodEnd && input.incomingPeriodEnd) {
    return new Date(input.incomingPeriodEnd).getTime() >= new Date(input.currentPeriodEnd).getTime();
  }

  return true;
}

async function recordWebhookReceipt(input: {
  provider: BillingProviderName;
  eventKey: string;
  organizationId: string | null;
  eventType: string;
  payloadHash: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("billing_webhook_events")
    .insert({
      provider: input.provider,
      event_key: input.eventKey,
      organization_id: input.organizationId,
      event_type: input.eventType,
      payload_hash: input.payloadHash,
      status: "received"
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { duplicate: true as const, id: null };
    }
    throw error;
  }

  return { duplicate: false as const, id: data?.id ?? null };
}

async function markWebhookProcessed(eventKey: string, provider: BillingProviderName, status: "processed" | "ignored_out_of_order", errorMessage?: string | null) {
  const admin = createAdminSupabaseClient();
  await admin
    .from("billing_webhook_events")
    .update({
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage ?? null
    })
    .eq("provider", provider)
    .eq("event_key", eventKey);
}

export async function createBillingCheckoutSession(input: {
  organizationId: string;
  user: { id: string; email?: string | null };
  billing: {
    billing_provider?: string | null;
    billing_customer_id?: string | null;
    billing_email?: string | null;
    name?: string | null;
  };
  plan: "starter" | "growth";
  providerOverride?: BillingProviderName;
  source?: string | null;
}) {
  const providerName = resolveBillingProvider(input.billing, input.providerOverride);
  const existingCustomerId = input.billing.billing_customer_id ?? null;

  const session = await createCheckoutSession({
    organizationId: input.organizationId,
    plan: input.plan,
    customer: {
      email: input.user.email ?? null,
      billingEmail: input.billing.billing_email ?? null,
      name: input.billing.name ?? null
    },
    existingCustomerId,
    providerOverride: providerName
  });

  const admin = createAdminSupabaseClient();
  const planCode = getProviderPlanCode(providerName, input.plan);
  const updatePayload: Record<string, unknown> = {
    billing_provider: providerName,
    billing_plan_code: planCode,
    billing_price_id: planCode
  };

  if (session.customerId) {
    updatePayload.billing_customer_id = session.customerId;
  }

  await admin.from("organizations").update(updatePayload).eq("id", input.organizationId);

  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.user.id,
    action: "billing.checkout_started",
    entityType: "billing",
    details: {
      plan: input.plan,
      provider: providerName,
      checkout_id: session.checkoutId ?? null,
      source: input.source ?? null
    }
  });

  return session;
}

export async function createBillingManagementSession(input: {
  organizationId: string;
  user: { id: string };
  billing: {
    billing_provider?: string | null;
    billing_customer_id?: string | null;
  };
  providerOverride?: BillingProviderName;
  source?: string | null;
}) {
  const providerName = resolveBillingProvider(input.billing, input.providerOverride);
  const customerId = input.billing.billing_customer_id ?? null;

  const session = await createCustomerManagementSession({
    organizationId: input.organizationId,
    customerId,
    providerOverride: providerName
  });

  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.user.id,
    action: "billing.portal_opened",
    entityType: "billing",
    details: { provider: providerName, supported: session.supported, source: input.source ?? null }
  });

  return session;
}

export async function persistBillingWebhookUpdate(result: BillingWebhookResult) {
  const admin = createAdminSupabaseClient();
  const eventKey =
    result.eventKey ??
    hashWebhookPayload({
      provider: result.provider,
      eventType: result.eventType,
      organizationId: result.organizationId,
      customerId: result.customerId,
      subscriptionId: result.subscriptionId,
      status: result.status,
      currentPeriodEnd: result.currentPeriodEnd
    });
  let organizationId = result.organizationId ?? null;

  if (!organizationId && result.customerId) {
    const lookup = await admin
      .from("organizations")
      .select("id")
      .eq("billing_customer_id", result.customerId)
      .maybeSingle();
    organizationId = lookup.data?.id ?? null;
  }

  if (!organizationId && result.subscriptionId) {
    const lookup = await admin
      .from("organizations")
      .select("id")
      .eq("billing_subscription_id", result.subscriptionId)
      .maybeSingle();
    organizationId = lookup.data?.id ?? null;
  }

  if (!organizationId) {
    return { updated: false };
  }

  const receipt = await recordWebhookReceipt({
    provider: result.provider,
    eventKey,
    organizationId,
    eventType: result.eventType,
    payloadHash: hashWebhookPayload(result.raw)
  });

  if (receipt.duplicate) {
    return { updated: false, duplicate: true };
  }

  const { data: currentOrg, error: currentOrgError } = await admin
    .from("organizations")
    .select("subscription_status, billing_subscription_status, billing_current_period_end, subscription_current_period_end")
    .eq("id", organizationId)
    .single();

  if (currentOrgError) throw currentOrgError;

  if (
    !shouldApplyBillingUpdate({
      currentStatus:
        currentOrg.billing_subscription_status ?? currentOrg.subscription_status ?? null,
      incomingStatus: result.status,
      currentPeriodEnd:
        currentOrg.billing_current_period_end ?? currentOrg.subscription_current_period_end ?? null,
      incomingPeriodEnd: result.currentPeriodEnd
    })
  ) {
    await markWebhookProcessed(eventKey, result.provider, "ignored_out_of_order");
    return { updated: false, organizationId, ignoredOutOfOrder: true };
  }

  const updatePayload: Record<string, unknown> = {
    billing_provider: result.provider
  };

  if (result.customerId) {
    updatePayload.billing_customer_id = result.customerId;
  }

  if (result.subscriptionId) {
    updatePayload.billing_subscription_id = result.subscriptionId;
  }

  if (result.planCode) {
    updatePayload.billing_plan_code = result.planCode;
    updatePayload.billing_price_id = result.priceId ?? result.planCode;
  }

  if (result.status) {
    updatePayload.billing_subscription_status = result.status;
    updatePayload.subscription_status = result.status;
  }

  if (result.currentPeriodEnd) {
    updatePayload.billing_current_period_end = result.currentPeriodEnd;
    updatePayload.subscription_current_period_end = result.currentPeriodEnd;
  }

  if (result.planTier) {
    updatePayload.plan_tier = result.planTier;
  }

  await admin.from("organizations").update(updatePayload).eq("id", organizationId);
  await markWebhookProcessed(eventKey, result.provider, "processed");

  await createAuditLog({
    organizationId,
    action: "billing.webhook_synced",
    entityType: "billing",
    details: {
      provider: result.provider,
      event_type: result.eventType,
      subscription_id: result.subscriptionId ?? null,
      customer_id: result.customerId ?? null
    }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    eventName: "checkout_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `checkout_completed:${result.provider}:${eventKey}`,
    properties: {
      provider: result.provider,
      event_type: result.eventType,
      subscription_id: result.subscriptionId ?? null,
      customer_id: result.customerId ?? null,
      plan_tier: result.planTier ?? null
    }
  });

  return { updated: true, organizationId };
}
