import { describe, expect, it } from "vitest";
import { calculateSupportEconomicsSnapshot } from "@/lib/commercial/support-economics";

describe("support economics", () => {
  it("flags high-touch low-ACV pressure when time burden overwhelms revenue", () => {
    const snapshot = calculateSupportEconomicsSnapshot({
      supportMinutes30d: 180,
      onboardingMinutes30d: 120,
      usageCost30d: 25,
      ocrCost30d: 12,
      monthlyRecurringRevenue: 99,
      importFailures30d: 2,
      completedImports30d: 1,
      importsCompletedWithoutActivation: true,
      reminderFailures30d: 1,
      extractionFailures30d: 1,
      missingSupportLogs: false,
      missingOnboardingLogs: false,
      missingUsageCostLogs: false
    });

    expect(snapshot.highTouchLowAcv).toBe(true);
    expect(snapshot.marginRiskStatus).toBe("risk");
    expect(snapshot.contributionMargin30d).toBeLessThan(0);
    expect(snapshot.supportSignals).toContain("$12 OCR cost logged in 30 days");
    expect(snapshot.rescueSignals).toContain("1 import jobs completed without first-value activation");
  });

  it("keeps missing telemetry explicit instead of pretending the account is efficient", () => {
    const snapshot = calculateSupportEconomicsSnapshot({
      supportMinutes30d: 0,
      onboardingMinutes30d: 0,
      usageCost30d: 0,
      ocrCost30d: 0,
      monthlyRecurringRevenue: 349,
      importFailures30d: 0,
      completedImports30d: 0,
      importsCompletedWithoutActivation: false,
      reminderFailures30d: 0,
      extractionFailures30d: 0,
      missingSupportLogs: true,
      missingOnboardingLogs: true,
      missingUsageCostLogs: true
    });

    expect(snapshot.missingTelemetry).toEqual(
      expect.arrayContaining([
        "Support time logs are missing.",
        "Onboarding time logs are missing.",
        "Usage cost logs are missing."
      ])
    );
  });
});
