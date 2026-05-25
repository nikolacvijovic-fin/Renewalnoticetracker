import { describe, expect, it } from "vitest";
import {
  getIntelligenceSurfaceAccess,
  type IntelligenceSurface
} from "@/lib/intelligence/access";
import type { BillingSnapshot } from "@/lib/billing/entitlements";

function makeContext(role: "admin" | "operator" | "reviewer" | "owner" = "admin") {
  return {
    user: {
      id: role === "owner" ? "owner-1" : "user-1",
      email: "user@example.com",
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: "2026-05-18T00:00:00.000Z"
    },
    organizationId: "org-1",
    role
  };
}

function makeBillingSnapshot(
  overrides: Partial<BillingSnapshot> = {}
): BillingSnapshot {
  return {
    organizationId: "org-1",
    planTier: "growth",
    subscriptionStatus: "active",
    billingProvider: "paddle",
    trialEndsAt: null,
    currentPeriodEnd: null,
    ...overrides
  };
}

function getSurfaceOutcomes(snapshot: BillingSnapshot) {
  const context = makeContext("admin");
  const surfaces = [
    "risk_badge",
    "risk_explanation",
    "risk_queue",
    "financial_dashboard",
    "procurement_dashboard"
  ] as const satisfies readonly IntelligenceSurface[];

  return Object.fromEntries(
    surfaces.map((surface) => [
      surface,
      getIntelligenceSurfaceAccess({
        context,
        billingSnapshot: snapshot,
        surface
      })
    ])
  ) as Record<(typeof surfaces)[number], ReturnType<typeof getIntelligenceSurfaceAccess>>;
}

describe("intelligence billing consistency", () => {
  it("keeps free-plan access denied consistently across all intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "free",
        subscriptionStatus: "inactive",
        billingProvider: "none"
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.financial_dashboard.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.procurement_dashboard.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_badge.allowed).toBe(false);
    expect(outcomes.risk_queue.allowed).toBe(false);
  });

  it("keeps starter-plan access consistent between contract detail and portfolio intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "starter",
        subscriptionStatus: "active",
        billingProvider: "paddle"
      })
    );

    expect(outcomes.risk_badge.allowed).toBe(true);
    expect(outcomes.risk_explanation.allowed).toBe(false);
    expect(outcomes.risk_queue.allowed).toBe(false);
    expect(outcomes.financial_dashboard.allowed).toBe(false);
    expect(outcomes.procurement_dashboard.allowed).toBe(false);
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("upgrade_required");
  });

  it("keeps growth-plan access allowed everywhere the admin role should be allowed", () => {
    const outcomes = getSurfaceOutcomes(makeBillingSnapshot());

    expect(outcomes.risk_badge.allowed).toBe(true);
    expect(outcomes.risk_explanation.allowed).toBe(true);
    expect(outcomes.risk_queue.allowed).toBe(true);
    expect(outcomes.financial_dashboard.allowed).toBe(true);
    expect(outcomes.procurement_dashboard.allowed).toBe(true);
  });

  it("blocks expired trials consistently across all intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "starter",
        subscriptionStatus: "trialing",
        trialEndsAt: "2020-01-01T00:00:00.000Z"
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("inactive_subscription");
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.financial_dashboard.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.procurement_dashboard.featureAccess.reason).toBe("upgrade_required");
    expect(outcomes.risk_badge.allowed).toBe(false);
  });

  it("blocks past-due subscriptions inside the grace window consistently across paid intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "growth",
        subscriptionStatus: "past_due",
        currentPeriodEnd: new Date(
          Date.now() - 2 * 24 * 60 * 60 * 1000
        ).toISOString()
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.financial_dashboard.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.procurement_dashboard.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.risk_badge.featureAccess.message).toContain("grace window");
    expect(outcomes.financial_dashboard.allowed).toBe(false);
  });

  it("blocks past-due subscriptions outside the grace window consistently across paid intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "growth",
        subscriptionStatus: "past_due",
        currentPeriodEnd: "2020-01-01T00:00:00.000Z"
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("subscription_past_due");
    expect(outcomes.financial_dashboard.featureAccess.message).not.toContain("grace window");
    expect(outcomes.procurement_dashboard.allowed).toBe(false);
  });

  it("blocks cancelled subscriptions consistently across paid intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "growth",
        subscriptionStatus: "cancelled"
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("subscription_cancelled");
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("subscription_cancelled");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("subscription_cancelled");
    expect(outcomes.financial_dashboard.featureAccess.reason).toBe("subscription_cancelled");
    expect(outcomes.procurement_dashboard.featureAccess.reason).toBe("subscription_cancelled");
  });

  it("blocks provider-not-configured states consistently across paid intelligence surfaces", () => {
    const outcomes = getSurfaceOutcomes(
      makeBillingSnapshot({
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "stripe"
      })
    );

    expect(outcomes.risk_badge.featureAccess.reason).toBe("provider_not_configured");
    expect(outcomes.risk_explanation.featureAccess.reason).toBe("provider_not_configured");
    expect(outcomes.risk_queue.featureAccess.reason).toBe("provider_not_configured");
    expect(outcomes.financial_dashboard.featureAccess.reason).toBe("provider_not_configured");
    expect(outcomes.procurement_dashboard.featureAccess.reason).toBe("provider_not_configured");
  });
});
