export const BILLING_POLICY_VERSION = "2026-04-20";

export const COMMERCIAL_POLICY = {
  version: BILLING_POLICY_VERSION,
  billingModel: "workspace_plus_tracked_contract_bands",
  pricingBasis: "workspace",
  annualDiscountPercent: 20,
  trialDurationDays: 14,
  failedPaymentGraceDays: 7,
  processorParityPolicy:
    "Normalized billing state and entitlements are authoritative, with Paddle as the only shipped-first self-serve provider and legacy providers reserved for migration-only support.",
  downgradePolicy:
    "Downgrades do not delete tracked contracts. They block new tracked contracts and gated paid actions until usage fits the lower plan.",
  trialExpiryPolicy:
    "When a paid trial expires without activation, the workspace falls back to free-tier entitlements.",
  reactivatePolicy:
    "Reactivation restores the paid plan only after the normalized subscription state returns to active or trialing."
} as const;

export type CommercialPlanTier = "free" | "starter" | "growth";

export type CommercialPlanDefinition = {
  tier: CommercialPlanTier;
  label: string;
  monthlyPriceUsd: number | null;
  annualPriceMonthlyEquivalentUsd: number | null;
  annualBillingAvailable: boolean;
  trackedContractLimit: number | null;
  includedEditors: number | null;
  viewerPolicy: string;
  description: string;
  features: string[];
};

export const COMMERCIAL_PLAN_DEFINITIONS: Record<
  CommercialPlanTier,
  CommercialPlanDefinition
> = {
  free: {
    tier: "free",
    label: "Free",
    monthlyPriceUsd: 0,
    annualPriceMonthlyEquivalentUsd: null,
    annualBillingAvailable: false,
    trackedContractLimit: 5,
    includedEditors: 1,
    viewerPolicy: "Unlimited viewers",
    description:
      "For proving the wedge with a small contract set before committing to a paid rollout.",
    features: [
      "Single workspace",
      "1 included editor and unlimited viewers",
      "Upload, review, owner assignment, and reminder-backed obligations",
      "No paid coordination or export features"
    ]
  },
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyPriceUsd: 99,
    annualPriceMonthlyEquivalentUsd: 79,
    annualBillingAvailable: true,
    trackedContractLimit: 100,
    includedEditors: 5,
    viewerPolicy: "Unlimited viewers",
    description:
      "For lean ops teams replacing spreadsheets with reviewed renewal coverage and clear owners.",
    features: [
      "5 included editor seats and unlimited viewers",
      "CSV and Excel export",
      "Bulk spreadsheet import",
      "Core reminder, review, and owner workflow",
      "Per-contract ICS export"
    ]
  },
  growth: {
    tier: "growth",
    label: "Growth",
    monthlyPriceUsd: 349,
    annualPriceMonthlyEquivalentUsd: 279,
    annualBillingAvailable: true,
    trackedContractLimit: 500,
    includedEditors: 15,
    viewerPolicy: "Unlimited viewers",
    description:
      "For teams that need deeper coordination, escalations, and cross-department accountability.",
    features: [
      "15 included editor seats and unlimited viewers",
      "Multi-recipient reminders and escalations",
      "Decision coordination and acknowledgment workflow",
      "Priority support and admin tooling"
    ]
  }
};

export function getTrackedContractLimit(planTier: CommercialPlanTier) {
  return COMMERCIAL_PLAN_DEFINITIONS[planTier].trackedContractLimit;
}

export function getMonthlyRevenueForPlan(planTier: CommercialPlanTier) {
  return COMMERCIAL_PLAN_DEFINITIONS[planTier].monthlyPriceUsd ?? 0;
}

export function isTrialExpired(
  trialEndsAt: string | null | undefined,
  referenceDate = new Date()
) {
  if (!trialEndsAt) return false;
  return new Date(trialEndsAt).getTime() < referenceDate.getTime();
}

export function isWithinFailedPaymentGrace(
  periodEnd: string | null | undefined,
  referenceDate = new Date()
) {
  if (!periodEnd) return false;
  const elapsedMs = referenceDate.getTime() - new Date(periodEnd).getTime();
  if (Number.isNaN(elapsedMs) || elapsedMs < 0) return false;
  return elapsedMs <= COMMERCIAL_POLICY.failedPaymentGraceDays * 24 * 60 * 60 * 1000;
}
