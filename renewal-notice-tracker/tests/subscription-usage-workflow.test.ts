import { describe, expect, it, vi } from "vitest";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import {
  prepareSubscriptionUsageFindingReview,
  sanitizeSubscriptionUsageAuditMetadata,
  summarizeSubscriptionUsageFindings
} from "@/lib/subscription-usage/findings";
import type { BillingSnapshot } from "@/lib/billing/entitlements";

const growthSnapshot: BillingSnapshot = {
  organizationId: "org-1",
  planTier: "growth",
  subscriptionStatus: "active",
  billingProvider: "none",
  trialEndsAt: null,
  currentPeriodEnd: null
};

describe("subscription usage optimization workflow", () => {
  it("requires Growth entitlement and healthy Python add-on", async () => {
    await expect(
      evaluateSubscriptionUsageOptimizationAccess(
        { ...growthSnapshot, planTier: "starter" },
        { checkHealth: vi.fn() }
      )
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "upgrade_required" }));

    await expect(
      evaluateSubscriptionUsageOptimizationAccess(growthSnapshot, {
        checkHealth: vi.fn(async () => ({ ok: false as const, errorCode: "not_configured" as const, safeMessage: "missing", addOnId: "subscription_usage_optimization", correlationId: "c1" }))
      })
    ).resolves.toEqual(expect.objectContaining({ allowed: false, reason: "not_configured" }));

    await expect(
      evaluateSubscriptionUsageOptimizationAccess(growthSnapshot, {
        checkHealth: vi.fn(async () => ({ ok: true as const, output: { service: "python", version: "1", status: "ok" as const }, addOnId: "subscription_usage_optimization", correlationId: "c1" }))
      })
    ).resolves.toEqual(expect.objectContaining({ allowed: true }));
  });

  it("requires a human-reviewed action before accepting findings", () => {
    expect(
      prepareSubscriptionUsageFindingReview({
        findingId: "finding-1",
        organizationId: "org-1",
        actorUserId: "user-1",
        nextStatus: "accepted"
      })
    ).toEqual(expect.objectContaining({ allowed: false, reason: "missing_action" }));

    expect(
      prepareSubscriptionUsageFindingReview({
        findingId: "finding-1",
        organizationId: "org-1",
        actorUserId: "user-1",
        nextStatus: "accepted",
        acceptedAction: "reduce_seats",
        realizedSavings: 1200
      })
    ).toEqual(expect.objectContaining({ allowed: true, acceptedAction: "reduce_seats" }));
  });

  it("does not allow action-planned termination to imply automatic cancellation", () => {
    expect(
      prepareSubscriptionUsageFindingReview({
        findingId: "finding-1",
        organizationId: "org-1",
        actorUserId: "user-1",
        nextStatus: "action_planned",
        acceptedAction: "terminate"
      })
    ).toEqual(expect.objectContaining({ allowed: false, reason: "automatic_cancellation_not_allowed" }));
  });

  it("summarizes findings while excluding sample warnings", () => {
    expect(
      summarizeSubscriptionUsageFindings([
        {
          findingType: "unused_seats",
          reasonCode: "purchased_seats_exceed_active_users_30d",
          calculationVersion: "v1",
          sourceRowIds: ["row-1"],
          matchedContractIds: [],
          utilization: 0.2,
          unusedSeats: 80,
          confidence: 0.9,
          warnings: [],
          estimatedSavings: 8000,
          currency: "USD",
          recommendedAction: "reduce_seats",
          reviewStatus: "open"
        },
        {
          findingType: "unused_seats",
          reasonCode: "sample",
          calculationVersion: "v1",
          sourceRowIds: ["row-2"],
          matchedContractIds: [],
          utilization: 0,
          unusedSeats: 10,
          confidence: 0.9,
          warnings: ["sample_usage_excluded"],
          estimatedSavings: 1000,
          currency: "USD",
          recommendedAction: "reduce_seats",
          reviewStatus: "open"
        }
      ])
    ).toEqual(expect.objectContaining({ openCount: 1, estimatedSavings: 8000, currency: "USD" }));
  });

  it("keeps audit metadata allowlisted and redacted", () => {
    const safe = sanitizeSubscriptionUsageAuditMetadata({
      organizationId: "org-1",
      findingId: "finding-1",
      issueCodes: ["missing_price_per_seat_basis"],
      rawFile: "RAW_USAGE_FILE_SHOULD_NOT_SURVIVE",
      providerPayload: "secret token payload",
      reasonCode: "safe_reason"
    });

    expect(safe).toEqual({
      organizationId: "org-1",
      findingId: "finding-1",
      issueCodes: ["missing_price_per_seat_basis"],
      reasonCode: "safe_reason"
    });
    expect(JSON.stringify(safe)).not.toMatch(/RAW_USAGE_FILE|secret|token|payload/i);
  });

  it("preserves structured overlap feedback in safe review evidence", () => {
    expect(
      prepareSubscriptionUsageFindingReview({
        findingId: "finding-overlap",
        organizationId: "org-1",
        actorUserId: "reviewer-1",
        nextStatus: "rejected",
        feedbackClassification: "incorrect",
        feedbackReason: "separate_departments"
      })
    ).toEqual(expect.objectContaining({
      allowed: true,
      auditMetadata: expect.objectContaining({
        feedbackClassification: "incorrect",
        feedbackReason: "separate_departments"
      })
    }));
  });
});
