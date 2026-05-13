import type { BillingProviderName, PlanTier } from "@/lib/billing/types";
import { getPaddleConfig } from "@/lib/billing/config";
import { getPayPalConfig, getStripeLegacyConfig } from "@/legacy/billing/config";

export function getProviderPlanCode(provider: BillingProviderName, plan: PlanTier) {
  if (provider === "paddle") {
    const config = getPaddleConfig();
    return plan === "starter" ? config.starterPriceId : config.growthPriceId;
  }

  if (provider === "paypal") {
    const config = getPayPalConfig();
    return plan === "starter" ? config.starterPlanId : config.growthPlanId;
  }

  const config = getStripeLegacyConfig();
  return plan === "starter" ? config.starterPriceId : config.growthPriceId;
}

export function resolvePlanTierForProvider(provider: BillingProviderName, planCode?: string | null) {
  if (!planCode) return null;

  if (provider === "paddle") {
    const config = getPaddleConfig();
    if (planCode === config.starterPriceId) return "starter";
    if (planCode === config.growthPriceId) return "growth";
  }

  if (provider === "paypal") {
    const config = getPayPalConfig();
    if (planCode === config.starterPlanId) return "starter";
    if (planCode === config.growthPlanId) return "growth";
  }

  if (provider === "stripe") {
    const config = getStripeLegacyConfig();
    if (planCode === config.starterPriceId) return "starter";
    if (planCode === config.growthPriceId) return "growth";
  }

  return null;
}
