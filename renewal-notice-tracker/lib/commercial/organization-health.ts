import type { Json } from "@/lib/supabase/database.types";

export type OrganizationHealthSnapshot = {
  activationScore: number;
  retentionScore: number;
  commercialScore: number;
  supportBurdenScore: number;
  trustScore: number;
  overallHealthScore: number;
  status: "healthy" | "watch" | "risk";
  blockers: string[];
  warnings: string[];
  activationSignals: string[];
  churnSignals: string[];
  supportSignals: string[];
  missingTelemetry: string[];
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function calculateOrganizationHealthSnapshot(input: {
  totalContracts: number;
  reviewedContracts: number;
  ownerAssignedContracts: number;
  reminderCount: number;
  decisionCount: number;
  contractLimit: number | null;
  supportMinutes30d: number;
  onboardingMinutes30d: number;
  ocrCost30d: number;
  reminderFailures30d: number;
  extractionFailures30d: number;
  repeatedReminderFailures: boolean;
  repeatedExtractionFailures: boolean;
  checkoutStarted30d: number;
  checkoutCompleted30d: number;
  lowWorkflowRevisit: boolean;
  dueSoonNeedsReviewCount?: number;
  dueSoonOwnerMissingCount?: number;
  staleNeedsReviewCount?: number;
  missingSupportTelemetry?: boolean;
  missingOnboardingTelemetry?: boolean;
  missingCostTelemetry?: boolean;
}): OrganizationHealthSnapshot {
  const activationScore = clamp(
    (input.totalContracts > 0 ? 30 : 0) +
      (input.reviewedContracts > 0 ? 30 : 0) +
      (input.ownerAssignedContracts > 0 ? 20 : 0) +
      (input.reminderCount > 0 ? 20 : 0)
  );

  const retentionPenalty =
    (input.reviewedContracts === 0 ? 25 : 0) +
    (input.ownerAssignedContracts === 0 ? 20 : 0) +
    (input.reminderCount === 0 ? 20 : 0) +
    (input.decisionCount === 0 && input.reviewedContracts > 0 ? 10 : 0) +
    (input.lowWorkflowRevisit ? 15 : 0) +
    (input.repeatedReminderFailures ? 10 : 0);
  const retentionScore = clamp(100 - retentionPenalty);

  const capacityPressure =
    input.contractLimit && input.contractLimit > 0
      ? input.totalContracts / input.contractLimit
      : 0;
  const commercialPenalty =
    (capacityPressure >= 0.9 ? 25 : capacityPressure >= 0.75 ? 10 : 0) +
    (input.checkoutStarted30d > 0 && input.checkoutCompleted30d === 0 ? 20 : 0);
  const commercialScore = clamp(100 - commercialPenalty);

  const supportBurdenPenalty =
    (input.supportMinutes30d >= 120 ? 25 : input.supportMinutes30d >= 60 ? 10 : 0) +
    (input.onboardingMinutes30d >= 120 ? 20 : input.onboardingMinutes30d >= 60 ? 8 : 0) +
    (input.ocrCost30d >= 25 ? 15 : input.ocrCost30d > 0 ? 5 : 0);
  const supportBurdenScore = clamp(100 - supportBurdenPenalty);

  const trustPenalty =
    Math.min(input.reminderFailures30d * 8, 24) +
    Math.min(input.extractionFailures30d * 6, 24) +
    (input.repeatedReminderFailures ? 18 : 0) +
    (input.repeatedExtractionFailures ? 18 : 0) +
    Math.min((input.dueSoonNeedsReviewCount ?? 0) * 10, 20) +
    Math.min((input.dueSoonOwnerMissingCount ?? 0) * 10, 20);
  const trustScore = clamp(100 - trustPenalty);

  const overallHealthScore = clamp(
    activationScore * 0.3 +
      retentionScore * 0.25 +
      commercialScore * 0.15 +
      supportBurdenScore * 0.15 +
      trustScore * 0.15
  );

  const blockers = [
    input.reviewedContracts === 0 ? "No reviewed contract exists yet." : null,
    input.ownerAssignedContracts === 0 ? "No accountable owner has been assigned yet." : null,
    input.reminderCount === 0 ? "No reminder-backed obligation exists yet." : null,
    (input.dueSoonNeedsReviewCount ?? 0) > 0
      ? `${input.dueSoonNeedsReviewCount} due-soon contract${(input.dueSoonNeedsReviewCount ?? 0) === 1 ? "" : "s"} still require review.`
      : null,
    (input.dueSoonOwnerMissingCount ?? 0) > 0
      ? `${input.dueSoonOwnerMissingCount} due-soon contract${(input.dueSoonOwnerMissingCount ?? 0) === 1 ? "" : "s"} still lack an owner.`
      : null,
    input.repeatedReminderFailures ? "Repeated reminder failures are eroding workflow trust." : null,
    input.repeatedExtractionFailures ? "Repeated extraction failures are blocking trustworthy activation." : null
  ].filter(Boolean) as string[];

  const warnings = [
    input.decisionCount === 0 && input.reviewedContracts > 0
      ? "Reviewed contracts still lack explicit renewal decisions."
      : null,
    capacityPressure >= 0.75 ? "Tracked-contract capacity pressure is rising." : null,
    (input.staleNeedsReviewCount ?? 0) > 0
      ? `${input.staleNeedsReviewCount} contract${(input.staleNeedsReviewCount ?? 0) === 1 ? "" : "s"} have been stuck in needs_review beyond the SLA.`
      : null,
    input.checkoutStarted30d > 0 && input.checkoutCompleted30d === 0
      ? "Checkout intent exists without completed conversion."
      : null,
    input.lowWorkflowRevisit ? "Workflow revisit depth is shallow for the current account state." : null
  ].filter(Boolean) as string[];

  const activationSignals = [
    input.totalContracts > 0 ? `${input.totalContracts} contracts are tracked.` : null,
    input.reviewedContracts > 0 ? `${input.reviewedContracts} contracts are reviewed.` : null,
    input.ownerAssignedContracts > 0 ? `${input.ownerAssignedContracts} contracts have owners.` : null,
    input.reminderCount > 0 ? `${input.reminderCount} reminders are live.` : null,
    input.decisionCount > 0 ? `${input.decisionCount} renewal decisions are recorded.` : null
  ].filter(Boolean) as string[];

  const churnSignals = [
    input.reviewedContracts === 0 ? "No first reviewed contract." : null,
    input.ownerAssignedContracts === 0 ? "No first owner assigned." : null,
    input.reminderCount === 0 ? "No first reminder created." : null,
    input.lowWorkflowRevisit ? "Low workflow revisit." : null,
    input.checkoutStarted30d > 0 && input.checkoutCompleted30d === 0 ? "Shallow billing intent." : null
  ].filter(Boolean) as string[];

  const supportSignals = [
    input.supportMinutes30d > 0 ? `${input.supportMinutes30d} support minutes in 30 days.` : null,
    input.onboardingMinutes30d > 0 ? `${input.onboardingMinutes30d} onboarding minutes in 30 days.` : null,
    input.ocrCost30d > 0 ? `$${input.ocrCost30d} OCR cost in 30 days.` : null
  ].filter(Boolean) as string[];

  const missingTelemetry = [
    input.missingSupportTelemetry ? "Support time telemetry is missing." : null,
    input.missingOnboardingTelemetry ? "Onboarding time telemetry is missing." : null,
    input.missingCostTelemetry ? "Usage-cost telemetry is missing." : null
  ].filter(Boolean) as string[];

  const status: OrganizationHealthSnapshot["status"] =
    blockers.length >= 3 || overallHealthScore < 55
      ? "risk"
      : overallHealthScore >= 75
        ? "healthy"
        : "watch";

  return {
    activationScore,
    retentionScore,
    commercialScore,
    supportBurdenScore,
    trustScore,
    overallHealthScore,
    status,
    blockers,
    warnings,
    activationSignals,
    churnSignals,
    supportSignals,
    missingTelemetry
  };
}

export function buildOrganizationHealthDetails(snapshot: OrganizationHealthSnapshot): Json {
  return {
    blockers: snapshot.blockers,
    warnings: snapshot.warnings,
    activation_signals: snapshot.activationSignals,
    churn_signals: snapshot.churnSignals,
    support_signals: snapshot.supportSignals,
    missing_telemetry: snapshot.missingTelemetry
  };
}
