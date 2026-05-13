import type { BillingProviderName, PlanTier } from "@/lib/billing/types";
import { getPaddleConfig } from "@/lib/billing/config";

export function getProviderPlanCode(provider: BillingProviderName, plan: PlanTier) {
  if (provider !== "paddle") {
    throw new Error("Legacy billing plan resolution is not available in shipped-first runtime.");
  }

  const config = getPaddleConfig();
  return plan === "starter" ? config.starterPriceId : config.growthPriceId;
}

export function resolvePlanTierForProvider(provider: BillingProviderName, planCode?: string | null) {
  if (!planCode) return null;

  if (provider === "paddle") {
    const config = getPaddleConfig();
    if (planCode === config.starterPriceId) return "starter";
    if (planCode === config.growthPriceId) return "growth";
  }

  return null;
}
