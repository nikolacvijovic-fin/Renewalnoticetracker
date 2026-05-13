import { describe, expect, it } from "vitest";
import {
  CommercialAccessError,
  canUseFeature,
  getContractTrackingLimitResult,
  getFeatureAccessResult,
  getAllowedReminderRecipients,
  normalizeBillingSnapshot
} from "@/lib/billing/entitlements";
import { COMMERCIAL_POLICY } from "@/lib/billing/policy";

describe("billing entitlements", () => {
  const freeSnapshot = normalizeBillingSnapshot({
    organizationId: "org-free",
    plan_tier: "free",
    subscription_status: "inactive",
    billing_provider: null
  });

  const growthSnapshot = normalizeBillingSnapshot({
    organizationId: "org-growth",
    plan_tier: "growth",
    subscription_status: "active",
    billing_provider: "paddle"
  });

  const pastDueSnapshot = normalizeBillingSnapshot({
    organizationId: "org-past-due",
    plan_tier: "starter",
    subscription_status: "past_due",
    billing_provider: "paddle"
  });

  it("blocks paid features on the free plan", () => {
    expect(canUseFeature(freeSnapshot, "exports")).toBe(false);
    expect(canUseFeature(freeSnapshot, "manual_contracts")).toBe(false);
  });

  it("allows multi-recipient reminders on growth", () => {
    expect(canUseFeature(growthSnapshot, "multi_recipient_reminders")).toBe(true);
    expect(
      getAllowedReminderRecipients(growthSnapshot, ["ops@example.com", "finance@example.com"], {
        strict: true
      })
    ).toEqual(["ops@example.com", "finance@example.com"]);
  });

  it("throws on strict multi-recipient enforcement for lower plans", () => {
    expect(() =>
      getAllowedReminderRecipients(freeSnapshot, ["ops@example.com", "finance@example.com"], {
        strict: true
      })
    ).toThrow(CommercialAccessError);
  });

  it("truncates extra recipients when a non-strict path is used", () => {
    expect(
      getAllowedReminderRecipients(freeSnapshot, ["ops@example.com", "finance@example.com"], {
        strict: false
      })
    ).toEqual(["ops@example.com"]);
  });

  it("returns reason-aware access results for past-due subscriptions", () => {
    const access = getFeatureAccessResult(pastDueSnapshot, "exports");
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("subscription_past_due");
    expect(access.cta?.label).toBe("Resolve billing");
    expect(access.message).toContain(`${COMMERCIAL_POLICY.failedPaymentGraceDays} days`);
  });

  it("returns upgrade-required messaging for growth-only features", () => {
    const starterSnapshot = normalizeBillingSnapshot({
      organizationId: "org-starter",
      plan_tier: "starter",
      subscription_status: "active",
      billing_provider: "paddle"
    });

    const access = getFeatureAccessResult(starterSnapshot, "multi_recipient_reminders");
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("upgrade_required");
    expect(access.minimumPlan).toBe("growth");
  });

  it("caps free contract tracking and leaves room on starter", () => {
    const freeLimit = getContractTrackingLimitResult(freeSnapshot, 5);
    expect(freeLimit.allowed).toBe(false);
    expect(freeLimit.limit).toBe(5);

    const starterSnapshot = normalizeBillingSnapshot({
      organizationId: "org-starter-2",
      plan_tier: "starter",
      subscription_status: "active",
      billing_provider: "paddle"
    });
    const starterLimit = getContractTrackingLimitResult(starterSnapshot, 12);
    expect(starterLimit.allowed).toBe(true);
    expect(starterLimit.remaining).toBe(88);
  });

  it("treats expired paid trials as inactive for gated features", () => {
    const expiredTrialSnapshot = normalizeBillingSnapshot({
      organizationId: "org-trial",
      plan_tier: "starter",
      subscription_status: "trialing",
      billing_provider: "paddle",
      trial_ends_at: "2020-01-01T00:00:00.000Z"
    });

    const access = getFeatureAccessResult(expiredTrialSnapshot, "exports");
    expect(access.allowed).toBe(false);
    expect(access.reason).toBe("inactive_subscription");
    expect(access.message).toContain("trial has ended");
  });

  it("explains downgrade over-cap behavior in the contract-limit message", () => {
    const starterSnapshot = normalizeBillingSnapshot({
      organizationId: "org-starter-3",
      plan_tier: "starter",
      subscription_status: "active",
      billing_provider: "paddle"
    });

    const limit = getContractTrackingLimitResult(starterSnapshot, 100);
    expect(limit.allowed).toBe(false);
    expect(limit.message).toContain("block new tracked contracts");
  });
});
