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
import type { IntelligenceExplainabilityMetadata } from "@/lib/intelligence/shared/types";

const RISK_CALCULATION_VERSION = "risk_score.v1";
const RISK_INPUT_DATA_VERSION = "trusted_workflow_state.v1";

export type RiskScoreResult = {
  risk_band: "low" | "medium" | "high" | "critical";
  score_points: number;
  reasons: RiskReason[];
  confidence_level: RiskConfidenceLevel;
  missing_data_warnings: RiskMissingDataWarning[];
  evidence_basis: RiskEvidenceBasis[];
  last_calculated_at: string;
  explanation_metadata: IntelligenceExplainabilityMetadata;
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
    last_calculated_at: (options?.now ?? new Date()).toISOString(),
    explanation_metadata: buildExplainabilityMetadata(input, evidence_basis, missing_data_warnings)
  };
}

function buildExplainabilityMetadata(
  input: RiskScoreInput,
  evidenceBasis: RiskEvidenceBasis[],
  warnings: RiskMissingDataWarning[]
): IntelligenceExplainabilityMetadata {
  const trustedFields = new Set<string>();
  const lowConfidenceFields = new Set<string>();
  const excludedFields = new Set<string>();

  for (const evidence of evidenceBasis) {
    const field = mapFactorToField(evidence.factor);
    if (evidence.trusted) {
      trustedFields.add(field);
    } else {
      lowConfidenceFields.add(field);
    }
  }

  if (!input.noticeDeadlineDate) excludedFields.add("notice_deadline_date");
  if (!input.renewalDate) excludedFields.add("renewal_date");
  if (!input.expirationDate) excludedFields.add("expiration_date");
  if (input.contractValueAmount == null) excludedFields.add("contract_value_amount");
  if (input.autoRenewalConfirmed === null) excludedFields.add("auto_renewal");
  if (!input.reviewCompleted) lowConfidenceFields.add("review_status");
  if (input.weakEvidence) lowConfidenceFields.add("evidence_quality");
  if (input.acceptedRiskOverride) lowConfidenceFields.add("accepted_risk_override");
  if (input.reminderDeliveryFailures > 0) lowConfidenceFields.add("reminder_delivery_failures");
  if (input.duplicateCounterpartyUncertainty) {
    lowConfidenceFields.add("counterparty_identity");
  }

  return {
    calculation_version: RISK_CALCULATION_VERSION,
    input_data_version: RISK_INPUT_DATA_VERSION,
    trusted_fields_used: [...trustedFields].sort(),
    low_confidence_fields_used: [...lowConfidenceFields].sort(),
    excluded_fields: [...excludedFields].sort(),
    warnings
  };
}

function mapFactorToField(factor: string) {
  switch (factor) {
    case "notice_deadline_proximity":
      return "notice_deadline_date";
    case "renewal_date_proximity":
      return "renewal_date";
    case "expiration_date_proximity":
      return "expiration_date";
    case "auto_renewal_confirmed":
      return "auto_renewal";
    case "contract_value":
      return "contract_value_amount";
    case "missing_owner":
      return "owner_user_id";
    case "missing_decision":
      return "decision_status";
    case "unacknowledged_reminder":
      return "acknowledgment_status";
    case "weak_evidence":
      return "evidence_quality";
    case "unreviewed_p0":
      return "review_status";
    case "accepted_risk_override":
      return "accepted_risk_override";
    case "price_change_trigger":
      return "price_change_trigger";
    case "previous_defer_watchlist":
      return "decision_history";
    case "reminder_delivery_failures":
      return "reminder_delivery_failures";
    case "duplicate_counterparty_uncertainty":
      return "counterparty_identity";
    default:
      return factor;
  }
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
