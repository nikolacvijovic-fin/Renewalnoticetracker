import type {
  IntelligenceCalculationBasis,
  IntelligenceDataQuality,
  IntelligenceSource,
  IntelligenceTrustLevel,
  IntelligenceWarning,
  TrustedWorkflowStateSnapshot
} from "@/lib/intelligence/shared/types";

export function deriveIntelligenceDataQuality(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceDataQuality {
  if (!snapshot.reviewCompleted) return "review_pending";
  if (
    !snapshot.noticeDeadlineDate &&
    !snapshot.renewalDate &&
    !snapshot.expirationDate
  ) {
    return "insufficient_p0";
  }
  if (!snapshot.ownerAssigned) return "review_complete_owner_missing";
  return "review_complete_owner_assigned";
}

export function deriveIntelligenceTrustLevel(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceTrustLevel {
  if (!snapshot.reviewCompleted) return "blocked";
  if (!snapshot.ownerAssigned) return "medium";
  if (snapshot.reminderActivationState === "failed") return "low";
  if (snapshot.reminderActivationState === "scheduled") return "high";
  return "medium";
}

export function buildIntelligenceWarnings(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceWarning[] {
  const warnings: IntelligenceWarning[] = [];

  if (!snapshot.reviewCompleted) {
    warnings.push({
      code: "review_pending",
      message: "Insight is blocked from trusted use until P0 review is complete.",
      severity: "critical"
    });
  }

  if (!snapshot.ownerAssigned) {
    warnings.push({
      code: "owner_missing",
      message: "Owner assignment is missing, so workflow-backed confidence is reduced.",
      severity: "warning"
    });
  }

  if (
    !snapshot.noticeDeadlineDate &&
    !snapshot.renewalDate &&
    !snapshot.expirationDate
  ) {
    warnings.push({
      code: "missing_p0_date",
      message: "No trusted P0 date is available for time-based intelligence.",
      severity: "critical"
    });
  }

  return warnings;
}

export function buildTrustedWorkflowSources(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceSource[] {
  return [
    {
      kind: "reviewed_p0",
      reference: snapshot.contractId,
      trusted: snapshot.reviewCompleted
    },
    {
      kind: "owner_assignment",
      reference: snapshot.contractId,
      trusted: snapshot.ownerAssigned
    },
    {
      kind: "renewal_decision",
      reference: snapshot.renewalDecisionStatus,
      trusted: snapshot.reviewCompleted
    },
    {
      kind: "reminder_runtime",
      reference: snapshot.reminderActivationState,
      trusted: snapshot.reminderActivationState === "scheduled"
    }
  ];
}

export function buildTrustedWorkflowBasis(slug: string): IntelligenceCalculationBasis {
  return {
    slug,
    description:
      "Derived from reviewed workflow state only. This layer is read-only and cannot mutate contract truth or reminder activation.",
    usesReviewedTruthOnly: true,
    blocksWhenTrustGatesFail: true
  };
}

export function deriveConfidenceScore(snapshot: TrustedWorkflowStateSnapshot) {
  let score = 0.25;
  if (snapshot.reviewCompleted) score += 0.35;
  if (snapshot.ownerAssigned) score += 0.2;
  if (
    snapshot.noticeDeadlineDate ||
    snapshot.renewalDate ||
    snapshot.expirationDate
  ) {
    score += 0.2;
  }

  return Number(score.toFixed(2));
}
