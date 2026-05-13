import type { Json } from "@/lib/supabase/database.types";

export type SupportEconomicsSnapshot = {
  supportMinutes30d: number;
  onboardingMinutes30d: number;
  usageCost30d: number;
  ocrCost30d: number;
  estimatedServiceCost30d: number;
  monthlyRecurringRevenue: number;
  contributionMargin30d: number;
  marginRiskStatus: "healthy" | "watch" | "risk";
  highTouchLowAcv: boolean;
  completedImports30d: number;
  importsCompletedWithoutActivation: boolean;
  rescueSignals: string[];
  supportSignals: string[];
  missingTelemetry: string[];
};

export function calculateSupportEconomicsSnapshot(input: {
  supportMinutes30d: number;
  onboardingMinutes30d: number;
  usageCost30d: number;
  ocrCost30d: number;
  monthlyRecurringRevenue: number;
  importFailures30d: number;
  completedImports30d: number;
  importsCompletedWithoutActivation: boolean;
  reminderFailures30d: number;
  extractionFailures30d: number;
  missingSupportLogs?: boolean;
  missingOnboardingLogs?: boolean;
  missingUsageCostLogs?: boolean;
}): SupportEconomicsSnapshot {
  const estimatedServiceCost30d = Math.round(
    input.supportMinutes30d * 1.5 + input.onboardingMinutes30d * 1.8
  );
  const contributionMargin30d = Math.round(
    input.monthlyRecurringRevenue - input.usageCost30d - estimatedServiceCost30d
  );

  const failureBurden =
    input.importFailures30d * 2 + input.reminderFailures30d * 3 + input.extractionFailures30d * 2;
  const timeBurden = input.supportMinutes30d + input.onboardingMinutes30d;
  const highTouchLowAcv =
    input.monthlyRecurringRevenue > 0 &&
    (timeBurden >= 180 || failureBurden >= 6) &&
    contributionMargin30d < input.monthlyRecurringRevenue * 0.35;

  const marginRiskStatus: SupportEconomicsSnapshot["marginRiskStatus"] =
    contributionMargin30d < 0 || highTouchLowAcv
      ? "risk"
      : contributionMargin30d < input.monthlyRecurringRevenue * 0.55
        ? "watch"
        : "healthy";

  const rescueSignals = [
    input.importsCompletedWithoutActivation
      ? `${input.completedImports30d} import jobs completed without first-value activation`
      : null,
    input.importFailures30d > 0 ? `${input.importFailures30d} import failures in the last 30 days` : null,
    input.reminderFailures30d > 0
      ? `${input.reminderFailures30d} reminder failures in the last 30 days`
      : null,
    input.extractionFailures30d > 0
      ? `${input.extractionFailures30d} extraction failures in the last 30 days`
      : null
  ].filter(Boolean) as string[];

  const supportSignals = [
    input.supportMinutes30d > 0 ? `${input.supportMinutes30d} support minutes logged in 30 days` : null,
    input.onboardingMinutes30d > 0
      ? `${input.onboardingMinutes30d} onboarding minutes logged in 30 days`
      : null,
    input.ocrCost30d > 0 ? `$${input.ocrCost30d} OCR cost logged in 30 days` : null,
    highTouchLowAcv ? "High-touch account pressure is materially above healthy ACV support levels." : null
  ].filter(Boolean) as string[];

  const missingTelemetry = [
    input.missingSupportLogs ? "Support time logs are missing." : null,
    input.missingOnboardingLogs ? "Onboarding time logs are missing." : null,
    input.missingUsageCostLogs ? "Usage cost logs are missing." : null
  ].filter(Boolean) as string[];

  return {
    supportMinutes30d: input.supportMinutes30d,
    onboardingMinutes30d: input.onboardingMinutes30d,
    usageCost30d: input.usageCost30d,
    ocrCost30d: input.ocrCost30d,
    estimatedServiceCost30d,
    monthlyRecurringRevenue: input.monthlyRecurringRevenue,
    contributionMargin30d,
    marginRiskStatus,
    highTouchLowAcv,
    completedImports30d: input.completedImports30d,
    importsCompletedWithoutActivation: input.importsCompletedWithoutActivation,
    rescueSignals,
    supportSignals,
    missingTelemetry
  };
}

export function buildProfitabilitySnapshotDetails(snapshot: SupportEconomicsSnapshot): Json {
  return {
    high_touch_low_acv: snapshot.highTouchLowAcv,
    rescue_signals: snapshot.rescueSignals,
    support_signals: snapshot.supportSignals,
    missing_telemetry: snapshot.missingTelemetry
  } as Json;
}
