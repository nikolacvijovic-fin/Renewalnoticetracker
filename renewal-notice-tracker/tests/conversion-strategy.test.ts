import { describe, expect, it, vi } from "vitest";
import {
  ACTIVATION_POLICY,
  getOnboardingChecklist,
  getTrialDaysRemaining,
  getUpgradePrompts
} from "@/lib/commercial/conversion";
import { getActivationStatus } from "@/lib/commercial/activation";

describe("conversion strategy helpers", () => {
  it("builds a first-value checklist from dashboard state", () => {
    const items = getOnboardingChecklist({
      organizationId: "org_123",
      organizationCreatedAt: "2026-04-01T00:00:00.000Z",
      totalContracts: 1,
      needsReview: 0,
      renewalsDueSoon: 1,
      noticeDeadlinesDueSoon: 0,
      reviewedContracts: 1,
      ownerAssignedContracts: 1,
      reminderCount: 1,
      decisionCount: 1,
      completedImportCount30d: 0
    });

    expect(items).toHaveLength(4);
    expect(items.every((item) => item.completed)).toBe(true);
  });

  it("shows contract-cap and trial prompts when usage and timing justify it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00.000Z"));

    const prompts = getUpgradePrompts({
      organizationId: "org_123",
      planTier: "free",
      subscriptionStatus: "trialing",
      billingProvider: "paddle",
      trialEndsAt: "2026-04-16T00:00:00.000Z",
      totalContracts: 5,
      needsReview: 0,
      renewalsDueSoon: 1,
      noticeDeadlinesDueSoon: 0,
      reviewedContracts: 1,
      ownerAssignedContracts: 1
    });

    expect(prompts.map((prompt) => prompt.title)).toContain("Expand tracked contract coverage");
    expect(prompts.map((prompt) => prompt.title)).toContain("Convert while the workflow is active");

    vi.useRealTimers();
  });

  it("calculates remaining trial days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T00:00:00.000Z"));

    expect(getTrialDaysRemaining("2026-04-20T00:00:00.000Z")).toBe(7);
    expect(getTrialDaysRemaining(null)).toBeNull();

    vi.useRealTimers();
  });

  it("flags import rescue when imports finish without first value", () => {
    const activation = getActivationStatus({
      organizationCreatedAt: "2026-04-01T00:00:00.000Z",
      totalContracts: 3,
      reviewedContracts: 0,
      ownerAssignedContracts: 0,
      liveObligationCount: 0,
      reminderCount: 0,
      decisionCount: 0,
      completedImportCount30d: 2
    });

    expect(activation.firstValueAchieved).toBe(false);
    expect(activation.activationWindowState).toBe("missed");
    expect(activation.rescueSignals.some((item) => item.includes("Imports completed without activation"))).toBe(true);
    expect(ACTIVATION_POLICY.activationWindowDays).toBe(14);
  });
});
