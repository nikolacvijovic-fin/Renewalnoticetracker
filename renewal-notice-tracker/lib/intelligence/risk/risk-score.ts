import { startOfDay } from "date-fns";
import {
  calculateContractValueScore,
  calculateDateProximityScore,
  collectMissingDataWarnings,
  deriveConfidenceLevel,
  deriveRiskBand,
  labelForFactor,
  type RiskConfidenceLevel,
  type RiskEvidenceBasis,
  type RiskMissingDataWarning,
  type RiskReason,
  type RiskScoreInput
} from "@/lib/intelligence/risk/risk-factors";

export type RiskScoreResult = {
  risk_band: "low" | "medium" | "high" | "critical";
  score_points: number;
  reasons: RiskReason[];
  confidence_level: RiskConfidenceLevel;
  missing_data_warnings: RiskMissingDataWarning[];
  evidence_basis: RiskEvidenceBasis[];
  last_calculated_at: string;
};

export function calculateRiskScore(
  input: RiskScoreInput,
  options?: {
    now?: Date;
  }
): RiskScoreResult {
  const today = startOfDay(options?.now ?? new Date());
  const factors = [
    calculateDateProximityScore("notice_deadline_proximity", input.noticeDeadlineDate, today),
    calculateDateProximityScore("renewal_date_proximity", input.renewalDate, today),
    calculateDateProximityScore("expiration_date_proximity", input.expirationDate, today),
    input.autoRenewalConfirmed === true
      ? factor("auto_renewal_confirmed", 16, "Confirmed auto-renewal raises the cost of missing the current decision window.")
      : null,
    calculateContractValueScore(input.contractValueAmount),
    input.ownerAssigned
      ? null
      : factor("missing_owner", 14, "No owner is assigned to carry the renewal workflow.")
    ,
    input.decisionStatus === "undecided"
      ? factor("missing_decision", 18, "A renewal decision is still missing.")
      : null,
    input.reminderAcknowledged
      ? null
      : factor("unacknowledged_reminder", 12, "A reminder still lacks acknowledgment.")
    ,
    input.weakEvidence
      ? lowTrustFactor("weak_evidence", 8, "The reviewed evidence is weak, so operational certainty is reduced.")
      : null,
    input.reviewCompleted
      ? null
      : lowTrustFactor("unreviewed_p0", 20, "P0 review is incomplete, so workflow truth is not yet trusted.")
    ,
    input.acceptedRiskOverride
      ? lowTrustFactor("accepted_risk_override", 10, "An accepted-risk override remains visible and should stay in the working queue.")
      : null,
    input.priceChangeTrigger
      ? factor("price_change_trigger", 8, "A reviewed price-change trigger can raise renewal consequences.")
      : null,
    input.previousDeferWatchlist
      ? factor("previous_defer_watchlist", 10, "This contract has already been deferred or watchlisted before.")
      : null,
    input.reminderDeliveryFailures > 0
      ? lowTrustFactor(
          "reminder_delivery_failures",
          Math.min(18, 6 + input.reminderDeliveryFailures * 4),
          "Reminder delivery failures reduce confidence that the workflow reached the right people."
        )
      : null,
    input.duplicateCounterpartyUncertainty
      ? lowTrustFactor(
          "duplicate_counterparty_uncertainty",
          6,
          "Duplicate counterparty uncertainty can blur vendor concentration and decision ownership."
        )
      : null
  ].filter(Boolean);

  const reasons = factors
    .sort((left, right) => right!.points - left!.points)
    .map<RiskReason>((factor) => ({
      factor: factor!.code,
      label: labelForFactor(factor!.code),
      points: factor!.points,
      detail: factor!.detail
    }));

  const evidence_basis = factors.map((factor) => factor!.evidence);
  const missing_data_warnings = collectMissingDataWarnings(input);
  const confidence_level = deriveConfidenceLevel(input);
  const score_points = reasons.reduce((sum, reason) => sum + reason.points, 0);

  return {
    risk_band: deriveRiskBand(score_points),
    score_points,
    reasons,
    confidence_level,
    missing_data_warnings,
    evidence_basis,
    last_calculated_at: (options?.now ?? new Date()).toISOString()
  };
}

function factor(code: string, points: number, detail: string) {
  return {
    code,
    points,
    detail,
    evidence: {
      factor: code,
      source: code,
      trusted: true
    }
  };
}

function lowTrustFactor(code: string, points: number, detail: string) {
  return {
    code,
    points,
    detail,
    evidence: {
      factor: code,
      source: code,
      trusted: false
    }
  };
}
