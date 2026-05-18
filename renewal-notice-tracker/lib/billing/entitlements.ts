import type { BillingProviderName } from "@/lib/billing/types";
import { isBillingConfigured } from "@/lib/billing/config";
import { createAuditLog } from "@/lib/audit";
import { getOrganizationBilling } from "@/lib/contracts/kernel-queries";
import { getCustomerBillingProvider } from "@/lib/billing/provider-policy";
import {
  COMMERCIAL_PLAN_DEFINITIONS,
  COMMERCIAL_POLICY,
  getTrackedContractLimit,
  isTrialExpired,
  isWithinFailedPaymentGrace,
  type CommercialPlanTier
} from "@/lib/billing/policy";

export type CommercialFeature =
  | "exports"
  | "manual_contracts"
  | "multi_recipient_reminders"
  | "risk_badges"
  | "risk_scores"
  | "financial_intelligence"
  | "procurement_analytics"
  | "intelligence_settings";

export type ContractTrackingLimitResult = {
  allowed: boolean;
  currentCount: number;
  limit: number | null;
  remaining: number | null;
  message: string;
  cta?: {
    kind: "upgrade";
    label: string;
    href: string;
  };
};

export type CommercialAccessReason =
  | "allowed"
  | "upgrade_required"
  | "inactive_subscription"
  | "subscription_cancelled"
  | "subscription_past_due"
  | "provider_not_configured"
  | "management_unsupported";

export type BillingSnapshot = {
  organizationId: string;
  planTier: CommercialPlanTier;
  subscriptionStatus: string;
  billingProvider: BillingProviderName | "none";
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

export type CommercialAccessResult = {
  allowed: boolean;
  feature: CommercialFeature;
  reason: CommercialAccessReason;
  minimumPlan?: BillingSnapshot["planTier"];
  message: string;
  cta?: {
    kind: "upgrade" | "resolve_billing" | "contact_support";
    label: string;
    href?: string;
  };
};

export type CommercialCapabilitySummaryItem = {
  feature: CommercialFeature;
  label: string;
  access: CommercialAccessResult;
};

const FEATURE_MINIMUM_PLAN: Record<CommercialFeature, BillingSnapshot["planTier"]> = {
  exports: "starter",
  manual_contracts: "starter",
  multi_recipient_reminders: "growth",
  risk_badges: "starter",
  risk_scores: "growth",
  financial_intelligence: "growth",
  procurement_analytics: "growth",
  intelligence_settings: "growth"
};

export const COMMERCIAL_FEATURE_LABELS: Record<CommercialFeature, string> = {
  exports: "Exports",
  manual_contracts: "Manual contract creation",
  multi_recipient_reminders: "Multi-recipient reminders",
  risk_badges: "Risk badges",
  risk_scores: "Risk scores",
  financial_intelligence: "Financial Intelligence",
  procurement_analytics: "Procurement Analytics",
  intelligence_settings: "Intelligence settings"
};

export const CONTRACT_TRACKING_LIMITS: Record<BillingSnapshot["planTier"], number | null> = {
  free: getTrackedContractLimit("free"),
  starter: getTrackedContractLimit("starter"),
  growth: getTrackedContractLimit("growth")
};

function planRank(planTier: BillingSnapshot["planTier"]) {
  if (planTier === "growth") return 2;
  if (planTier === "starter") return 1;
  return 0;
}

function isPaidPlan(planTier: BillingSnapshot["planTier"]) {
  return planRank(planTier) > 0;
}

function isActiveSubscription(status: string) {
  return ["active", "trialing"].includes(status);
}

function getMinimumPlan(feature: CommercialFeature) {
  return FEATURE_MINIMUM_PLAN[feature];
}

function buildCommercialMessage(input: {
  feature: CommercialFeature;
  reason: CommercialAccessReason;
  planTier: BillingSnapshot["planTier"];
  minimumPlan: BillingSnapshot["planTier"];
  billingProvider: BillingSnapshot["billingProvider"];
}) {
  switch (input.reason) {
    case "upgrade_required":
      return {
        message: `${COMMERCIAL_FEATURE_LABELS[input.feature]} requires the ${input.minimumPlan} plan.`,
        cta: { kind: "upgrade" as const, label: "Upgrade plan", href: "/dashboard/settings" }
      };
    case "subscription_past_due":
      return {
        message: `${COMMERCIAL_FEATURE_LABELS[input.feature]} is unavailable while the subscription is past due. The workspace keeps its paid plan metadata for ${COMMERCIAL_POLICY.failedPaymentGraceDays} days, but gated paid actions stay blocked until billing is resolved.`,
        cta: { kind: "resolve_billing" as const, label: "Resolve billing", href: "/dashboard/settings" }
      };
    case "subscription_cancelled":
      return {
        message: `${COMMERCIAL_FEATURE_LABELS[input.feature]} is unavailable because the subscription is cancelled.`,
        cta: { kind: "resolve_billing" as const, label: "Reactivate billing", href: "/dashboard/settings" }
      };
    case "inactive_subscription":
      return {
        message: `${COMMERCIAL_FEATURE_LABELS[input.feature]} is unavailable because there is no active paid subscription.`,
        cta: { kind: "upgrade" as const, label: "Choose a plan", href: "/dashboard/settings" }
      };
    case "provider_not_configured":
      return {
        message:
          input.billingProvider === "none"
            ? `${COMMERCIAL_FEATURE_LABELS[input.feature]} is unavailable because no billing provider is linked to this organization.`
            : `${COMMERCIAL_FEATURE_LABELS[input.feature]} is unavailable because ${input.billingProvider} billing is not configured in this environment.`,
        cta: { kind: "contact_support" as const, label: "Contact support", href: "/dashboard/settings" }
      };
    case "management_unsupported":
      return {
        message: "Self-serve billing management is not supported for the current provider in this app.",
        cta: { kind: "contact_support" as const, label: "Billing help", href: "/dashboard/settings" }
      };
    default:
      return { message: `${COMMERCIAL_FEATURE_LABELS[input.feature]} is available.`, cta: undefined };
  }
}

export function normalizeBillingSnapshot(input: {
  organizationId: string;
  plan_tier?: string | null;
  subscription_status?: string | null;
  billing_provider?: string | null;
  trial_ends_at?: string | null;
  subscription_current_period_end?: string | null;
}) {
  const planTier =
    input.plan_tier === "growth" || input.plan_tier === "starter" ? input.plan_tier : "free";
  const billingProvider =
    input.billing_provider === "paddle" ||
    input.billing_provider === "manual" ||
    input.billing_provider === "paypal" ||
    input.billing_provider === "stripe"
      ? getCustomerBillingProvider(input.billing_provider)
      : "none";

  return {
    organizationId: input.organizationId,
    planTier,
    subscriptionStatus: input.subscription_status ?? "inactive",
    billingProvider,
    trialEndsAt: input.trial_ends_at ?? null,
    currentPeriodEnd: input.subscription_current_period_end ?? null
  } satisfies BillingSnapshot;
}

export async function getBillingSnapshot(organizationId: string) {
  const billing = await getOrganizationBilling(organizationId);
  return normalizeBillingSnapshot({
    organizationId,
    plan_tier: billing.plan_tier,
    subscription_status: billing.subscription_status,
    billing_provider: billing.billing_provider,
    trial_ends_at: billing.trial_ends_at,
    subscription_current_period_end: billing.subscription_current_period_end
  });
}

export function getFeatureAccessResult(
  snapshot: BillingSnapshot,
  feature: CommercialFeature
): CommercialAccessResult {
  const minimumPlan = getMinimumPlan(feature);

  if (planRank(snapshot.planTier) < planRank(minimumPlan)) {
    const detail = buildCommercialMessage({
      feature,
      reason: "upgrade_required",
      planTier: snapshot.planTier,
      minimumPlan,
      billingProvider: snapshot.billingProvider
    });
    return {
      allowed: false,
      feature,
      reason: "upgrade_required",
      minimumPlan,
      message: detail.message,
      cta: detail.cta
    };
  }

  if (snapshot.subscriptionStatus === "trialing" && isTrialExpired(snapshot.trialEndsAt)) {
    const detail = buildCommercialMessage({
      feature,
      reason: "inactive_subscription",
      planTier: snapshot.planTier,
      minimumPlan,
      billingProvider: snapshot.billingProvider
    });
    return {
      allowed: false,
      feature,
      reason: "inactive_subscription",
      minimumPlan,
      message: `${detail.message} The ${COMMERCIAL_POLICY.trialDurationDays}-day trial has ended.`,
      cta: detail.cta
    };
  }

  if (isPaidPlan(snapshot.planTier) && !isActiveSubscription(snapshot.subscriptionStatus)) {
    const reason: CommercialAccessReason =
      snapshot.subscriptionStatus === "past_due"
        ? "subscription_past_due"
        : snapshot.subscriptionStatus === "cancelled"
          ? "subscription_cancelled"
          : "inactive_subscription";
    const detail = buildCommercialMessage({
      feature,
      reason,
      planTier: snapshot.planTier,
      minimumPlan,
      billingProvider: snapshot.billingProvider
    });
    return {
      allowed: false,
      feature,
      reason,
      minimumPlan,
      message:
        reason === "subscription_past_due" && isWithinFailedPaymentGrace(snapshot.currentPeriodEnd)
          ? `${detail.message} Billing is still inside the ${COMMERCIAL_POLICY.failedPaymentGraceDays}-day grace window.`
          : detail.message,
      cta: detail.cta
    };
  }

  if (isPaidPlan(snapshot.planTier) && snapshot.billingProvider !== "none" && !isBillingConfigured(snapshot.billingProvider)) {
    const detail = buildCommercialMessage({
      feature,
      reason: "provider_not_configured",
      planTier: snapshot.planTier,
      minimumPlan,
      billingProvider: snapshot.billingProvider
    });
    return {
      allowed: false,
      feature,
      reason: "provider_not_configured",
      minimumPlan,
      message: detail.message,
      cta: detail.cta
    };
  }

  return {
    allowed: true,
    feature,
    reason: "allowed",
    minimumPlan,
    message: buildCommercialMessage({
      feature,
      reason: "allowed",
      planTier: snapshot.planTier,
      minimumPlan,
      billingProvider: snapshot.billingProvider
    }).message
  };
}

export function canUseFeature(snapshot: BillingSnapshot, feature: CommercialFeature) {
  return getFeatureAccessResult(snapshot, feature).allowed;
}

export function getCommercialCapabilitySummary(
  snapshot: BillingSnapshot,
  features: CommercialFeature[] = [
    "manual_contracts",
    "exports",
    "multi_recipient_reminders"
  ]
): CommercialCapabilitySummaryItem[] {
  return features.map((feature) => ({
    feature,
    label: COMMERCIAL_FEATURE_LABELS[feature],
    access: getFeatureAccessResult(snapshot, feature)
  }));
}

export function getContractTrackingLimitResult(
  snapshot: BillingSnapshot,
  currentCount: number
): ContractTrackingLimitResult {
  const limit = CONTRACT_TRACKING_LIMITS[snapshot.planTier];

  if (limit === null) {
    return {
      allowed: true,
      currentCount,
      limit: null,
      remaining: null,
      message: "Contract tracking is available without a workspace limit on this plan."
    };
  }

  const remaining = Math.max(limit - currentCount, 0);
  const allowed = currentCount < limit;

  if (allowed) {
    return {
      allowed: true,
      currentCount,
      limit,
      remaining,
      message: `${currentCount} of ${limit} active tracked contracts used on the ${snapshot.planTier} plan.`
    };
  }

  const nextPlan = snapshot.planTier === "free" ? "starter" : "growth";
  const currentPlanDefinition = COMMERCIAL_PLAN_DEFINITIONS[snapshot.planTier];
  return {
    allowed: false,
    currentCount,
    limit,
    remaining: 0,
    message: `You have reached the ${currentPlanDefinition.label.toLowerCase()} plan limit of ${limit} active tracked contracts. ${COMMERCIAL_POLICY.downgradePolicy} Upgrade to ${nextPlan} to add more contracts.`,
    cta: {
      kind: "upgrade",
      label: `Upgrade to ${nextPlan}`,
      href: "/dashboard/settings"
    }
  };
}

export function getAllowedReminderRecipients(
  snapshot: BillingSnapshot,
  recipients: string[],
  options?: { strict?: boolean }
) {
  const access = getFeatureAccessResult(snapshot, "multi_recipient_reminders");
  if (access.allowed) {
    return recipients;
  }

  if (recipients.length <= 1) {
    return recipients;
  }

  if (options?.strict) {
    throw new CommercialAccessError("multi_recipient_reminders", snapshot.planTier, access);
  }

  return recipients.slice(0, 1);
}

export class CommercialAccessError extends Error {
  constructor(
    public readonly feature: CommercialFeature,
    public readonly planTier: BillingSnapshot["planTier"],
    public readonly access: CommercialAccessResult
  ) {
    super(access.message);
    this.name = "CommercialAccessError";
  }
}

export function getCommercialRedirectCode(feature: CommercialFeature, reason?: CommercialAccessReason) {
  switch (feature) {
    case "exports":
      return reason && reason !== "upgrade_required"
        ? `billing.exports.${reason}`
        : "billing.export_upgrade_required";
    case "manual_contracts":
      return reason && reason !== "upgrade_required"
        ? `billing.manual_contracts.${reason}`
        : "billing.manual_contract_upgrade_required";
    case "multi_recipient_reminders":
      return reason && reason !== "upgrade_required"
        ? `billing.multi_recipient_reminders.${reason}`
        : "billing.multi_recipient_upgrade_required";
    case "risk_badges":
      return reason && reason !== "upgrade_required"
        ? `billing.risk_badges.${reason}`
        : "billing.risk_badges_upgrade_required";
    case "risk_scores":
      return reason && reason !== "upgrade_required"
        ? `billing.risk_scores.${reason}`
        : "billing.risk_scores_upgrade_required";
    case "financial_intelligence":
      return reason && reason !== "upgrade_required"
        ? `billing.financial_intelligence.${reason}`
        : "billing.financial_intelligence_upgrade_required";
    case "procurement_analytics":
      return reason && reason !== "upgrade_required"
        ? `billing.procurement_analytics.${reason}`
        : "billing.procurement_analytics_upgrade_required";
    case "intelligence_settings":
      return reason && reason !== "upgrade_required"
        ? `billing.intelligence_settings.${reason}`
        : "billing.intelligence_settings_upgrade_required";
  }
}

export function getCommercialNoticeFromCode(code: string | null | undefined) {
  if (!code) return null;

  const lookup: Record<string, string> = {
    "billing.export_upgrade_required": "Exporting contracts requires a paid plan.",
    "billing.exports.subscription_past_due": "Exports are currently blocked because the subscription is past due.",
    "billing.exports.subscription_cancelled": "Exports are currently blocked because the subscription is cancelled.",
    "billing.exports.inactive_subscription": "Exports require an active paid subscription.",
    "billing.exports.provider_not_configured": "Exports are temporarily unavailable because billing is not configured correctly.",
    "billing.manual_contract_upgrade_required": "Manual contract creation requires a paid plan.",
    "billing.manual_contracts.subscription_past_due": "Manual contract creation is blocked while the subscription is past due.",
    "billing.manual_contracts.subscription_cancelled": "Manual contract creation is blocked because the subscription is cancelled.",
    "billing.manual_contracts.inactive_subscription": "Manual contract creation requires an active paid subscription.",
    "billing.manual_contracts.provider_not_configured": "Manual contract creation is temporarily unavailable because billing is not configured correctly.",
    "billing.multi_recipient_upgrade_required": "Multiple reminder recipients require the Growth plan.",
    "billing.multi_recipient_reminders.subscription_past_due": "Multiple reminder recipients are blocked while the subscription is past due.",
    "billing.multi_recipient_reminders.subscription_cancelled": "Multiple reminder recipients are blocked because the subscription is cancelled.",
    "billing.multi_recipient_reminders.inactive_subscription": "Multiple reminder recipients require an active Growth subscription.",
    "billing.multi_recipient_reminders.provider_not_configured": "Multiple reminder recipients are temporarily unavailable because billing is not configured correctly.",
    "billing.risk_badges_upgrade_required": "Risk badges require the Starter plan.",
    "billing.risk_badges.subscription_past_due": "Risk badges are currently blocked because the subscription is past due.",
    "billing.risk_badges.subscription_cancelled": "Risk badges are currently blocked because the subscription is cancelled.",
    "billing.risk_badges.inactive_subscription": "Risk badges require an active paid subscription.",
    "billing.risk_badges.provider_not_configured": "Risk badges are temporarily unavailable because billing is not configured correctly.",
    "billing.risk_scores_upgrade_required": "Risk scores require the Growth plan.",
    "billing.risk_scores.subscription_past_due": "Risk scores are currently blocked because the subscription is past due.",
    "billing.risk_scores.subscription_cancelled": "Risk scores are currently blocked because the subscription is cancelled.",
    "billing.risk_scores.inactive_subscription": "Risk scores require an active Growth subscription.",
    "billing.risk_scores.provider_not_configured": "Risk scores are temporarily unavailable because billing is not configured correctly.",
    "billing.financial_intelligence_upgrade_required": "Financial Intelligence requires the Growth plan.",
    "billing.financial_intelligence.subscription_past_due": "Financial Intelligence is currently blocked because the subscription is past due.",
    "billing.financial_intelligence.subscription_cancelled": "Financial Intelligence is currently blocked because the subscription is cancelled.",
    "billing.financial_intelligence.inactive_subscription": "Financial Intelligence requires an active Growth subscription.",
    "billing.financial_intelligence.provider_not_configured": "Financial Intelligence is temporarily unavailable because billing is not configured correctly.",
    "billing.procurement_analytics_upgrade_required": "Procurement Analytics requires the Growth plan.",
    "billing.procurement_analytics.subscription_past_due": "Procurement Analytics is currently blocked because the subscription is past due.",
    "billing.procurement_analytics.subscription_cancelled": "Procurement Analytics is currently blocked because the subscription is cancelled.",
    "billing.procurement_analytics.inactive_subscription": "Procurement Analytics requires an active Growth subscription.",
    "billing.procurement_analytics.provider_not_configured": "Procurement Analytics is temporarily unavailable because billing is not configured correctly.",
    "billing.intelligence_settings_upgrade_required": "Intelligence settings require the Growth plan.",
    "billing.intelligence_settings.subscription_past_due": "Intelligence settings are currently blocked because the subscription is past due.",
    "billing.intelligence_settings.subscription_cancelled": "Intelligence settings are currently blocked because the subscription is cancelled.",
    "billing.intelligence_settings.inactive_subscription": "Intelligence settings require an active Growth subscription.",
    "billing.intelligence_settings.provider_not_configured": "Intelligence settings are temporarily unavailable because billing is not configured correctly.",
    "billing.contract_tracking_limit_reached": "You have reached your tracked contract limit. Upgrade before adding more contracts."
  };

  return lookup[code] ?? null;
}

export async function createCommercialDenialAuditLog(input: {
  organizationId: string;
  actorUserId?: string | null;
  feature: CommercialFeature;
  billingSnapshot: BillingSnapshot;
  accessResult?: CommercialAccessResult;
  context?: Record<string, unknown>;
}) {
  const accessResult = input.accessResult ?? getFeatureAccessResult(input.billingSnapshot, input.feature);
  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: "billing.feature_denied",
    entityType: "billing",
    details: {
      feature: input.feature,
      reason: accessResult.reason,
      billing_provider: input.billingSnapshot.billingProvider,
      plan_tier: input.billingSnapshot.planTier,
      subscription_status: input.billingSnapshot.subscriptionStatus,
      redirect_code: getCommercialRedirectCode(input.feature, accessResult.reason),
      ...(input.context ?? {})
    }
  });
}

export async function enforceFeatureAccess(input: {
  organizationId: string;
  actorUserId?: string | null;
  feature: CommercialFeature;
  context?: Record<string, unknown>;
}) {
  const billingSnapshot = await getBillingSnapshot(input.organizationId);
  const accessResult = getFeatureAccessResult(billingSnapshot, input.feature);
  if (accessResult.allowed) {
    return { billingSnapshot, accessResult };
  }

  await createCommercialDenialAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    feature: input.feature,
    billingSnapshot,
    accessResult,
    context: input.context
  });

  throw new CommercialAccessError(input.feature, billingSnapshot.planTier, accessResult);
}
