import { canExecuteAddOn } from "@/lib/add-ons/add-on-registry";
import { checkPythonIntelligenceHealth } from "@/lib/add-ons/python-intelligence-client";
import type { BillingSnapshot } from "@/lib/billing/entitlements";
import { getFeatureAccessResult } from "@/lib/billing/entitlements";

export async function evaluateSubscriptionUsageOptimizationAccess(
  snapshot: BillingSnapshot,
  options?: {
    checkHealth?: typeof checkPythonIntelligenceHealth;
  }
) {
  const featureAccess = getFeatureAccessResult(snapshot, "subscription_usage_optimization");
  if (!featureAccess.allowed) {
    return {
      allowed: false,
      reason: featureAccess.reason,
      customerSafeMessage: featureAccess.message,
      featureAccess,
      addOnHealth: null
    };
  }

  const checkHealth = options?.checkHealth ?? checkPythonIntelligenceHealth;
  const addOnHealth = await checkHealth();
  const healthy = addOnHealth.ok && addOnHealth.output.status === "ok";
  const addOnDecision = canExecuteAddOn({
    addOnId: "subscription_usage_optimization",
    entitlements: ["subscription_usage_optimization"],
    healthy
  });

  if (!addOnDecision.allowed) {
    return {
      allowed: false,
      reason: addOnDecision.reason,
      customerSafeMessage:
        addOnDecision.reason === "not_configured"
          ? "Subscription Usage Optimization is temporarily unavailable while usage analysis is not configured."
          : "Subscription Usage Optimization is not available for this workspace.",
      featureAccess,
      addOnHealth
    };
  }

  return {
    allowed: true,
    reason: "allowed" as const,
    customerSafeMessage: "Subscription Usage Optimization is available.",
    featureAccess,
    addOnHealth
  };
}
