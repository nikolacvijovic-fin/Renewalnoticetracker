import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

export const RISK_BANDS = ["low", "medium", "high", "critical"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export const RISK_CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type RiskConfidenceLevel = (typeof RISK_CONFIDENCE_LEVELS)[number];

export type RiskReason = {
  factor: string;
  label: string;
  points: number;
  detail: string;
};

export type RiskEvidenceBasis = {
  factor: string;
  source: string;
  trusted: boolean;
};

export type RiskMissingDataWarning = {
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

export type RiskScoreInput = {
  contractId: string;
  contractTitle: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  autoRenewalConfirmed: boolean | null;
  contractValueAmount: number | null;
  ownerAssigned: boolean;
  decisionStatus:
    | "undecided"
    | "renew"
    | "terminate"
    | "renegotiate"
    | "defer"
    | "no_action_required";
  reminderAcknowledged: boolean;
  weakEvidence: boolean;
  reviewCompleted: boolean;
  acceptedRiskOverride: boolean;
  priceChangeTrigger: string | null;
  previousDeferWatchlist: boolean;
  reminderDeliveryFailures: number;
  duplicateCounterpartyUncertainty: boolean;
};

export type ScoredRiskFactor = {
  code: string;
  points: number;
  detail: string;
  evidence: RiskEvidenceBasis;
};

export function createRiskWarning(
  code: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning"
): RiskMissingDataWarning {
  return { code, message, severity };
}

export function calculateDateProximityScore(
  factor: "notice_deadline_proximity" | "renewal_date_proximity" | "expiration_date_proximity",
  dateValue: string | null,
  today = startOfDay(new Date())
): ScoredRiskFactor | null {
  if (!dateValue) return null;

  const targetDate = startOfDay(parseISO(dateValue));
  const daysUntil = differenceInCalendarDays(targetDate, today);

  if (daysUntil < 0) {
    return {
      code: factor,
      points: factor === "notice_deadline_proximity" ? 40 : 30,
      detail: `${labelForFactor(factor)} is already past due.`,
      evidence: {
        factor,
        source: dateValue,
        trusted: true
      }
    };
  }

  if (daysUntil <= 7) {
    return {
      code: factor,
      points: factor === "notice_deadline_proximity" ? 35 : 25,
      detail: `${labelForFactor(factor)} is due within 7 days.`,
      evidence: {
        factor,
        source: dateValue,
        trusted: true
      }
    };
  }

  if (daysUntil <= 14) {
    return {
      code: factor,
      points: factor === "notice_deadline_proximity" ? 28 : 20,
      detail: `${labelForFactor(factor)} is due within 14 days.`,
      evidence: {
        factor,
        source: dateValue,
        trusted: true
      }
    };
  }

  if (daysUntil <= 30) {
    return {
      code: factor,
      points: factor === "notice_deadline_proximity" ? 18 : 12,
      detail: `${labelForFactor(factor)} is due within 30 days.`,
      evidence: {
        factor,
        source: dateValue,
        trusted: true
      }
    };
  }

  if (daysUntil <= 60) {
    return {
      code: factor,
      points: factor === "notice_deadline_proximity" ? 10 : 8,
      detail: `${labelForFactor(factor)} is due within 60 days.`,
      evidence: {
        factor,
        source: dateValue,
        trusted: true
      }
    };
  }

  return null;
}

export function calculateContractValueScore(value: number | null): ScoredRiskFactor | null {
  if (value == null) return null;
  if (value >= 250000) {
    return scored("contract_value", 18, "Contract value is high enough to raise renewal risk priority.", String(value));
  }
  if (value >= 100000) {
    return scored("contract_value", 12, "Contract value is material and should stay near the top of the working queue.", String(value));
  }
  if (value >= 25000) {
    return scored("contract_value", 6, "Contract value is meaningful enough to influence renewal prioritization.", String(value));
  }
  return null;
}

export function labelForFactor(factor: string) {
  switch (factor) {
    case "notice_deadline_proximity":
      return "Notice deadline";
    case "renewal_date_proximity":
      return "Renewal date";
    case "expiration_date_proximity":
      return "Expiration date";
    case "auto_renewal_confirmed":
      return "Confirmed auto-renewal";
    case "contract_value":
      return "Contract value";
    case "missing_owner":
      return "Missing owner";
    case "missing_decision":
      return "Missing decision";
    case "unacknowledged_reminder":
      return "Unacknowledged reminder";
    case "weak_evidence":
      return "Weak evidence";
    case "unreviewed_p0":
      return "Unreviewed P0";
    case "accepted_risk_override":
      return "Accepted risk override";
    case "price_change_trigger":
      return "Price-change trigger";
    case "previous_defer_watchlist":
      return "Previous defer/watchlist";
    case "reminder_delivery_failures":
      return "Reminder delivery failures";
    case "duplicate_counterparty_uncertainty":
      return "Duplicate counterparty uncertainty";
    default:
      return factor;
  }
}

export function deriveRiskBand(scorePoints: number): RiskBand {
  if (scorePoints >= 85) return "critical";
  if (scorePoints >= 55) return "high";
  if (scorePoints >= 25) return "medium";
  return "low";
}

export function deriveConfidenceLevel(input: RiskScoreInput): RiskConfidenceLevel {
  if (!input.reviewCompleted) return "low";
  if (input.weakEvidence) return "low";

  const hasTrustedDates = Boolean(
    input.noticeDeadlineDate || input.renewalDate || input.expirationDate
  );
  const hasEnoughCoreFields =
    hasTrustedDates &&
    input.autoRenewalConfirmed !== null &&
    input.contractValueAmount !== null;

  if (hasEnoughCoreFields && input.reminderDeliveryFailures === 0) {
    return "high";
  }

  return "medium";
}

export function collectMissingDataWarnings(input: RiskScoreInput): RiskMissingDataWarning[] {
  const warnings: RiskMissingDataWarning[] = [];

  if (!input.noticeDeadlineDate && !input.renewalDate && !input.expirationDate) {
    warnings.push(
      createRiskWarning(
        "missing_p0_dates",
        "No trusted notice, renewal, or expiration date is available for time-based risk.",
        "critical"
      )
    );
  }

  if (input.contractValueAmount == null) {
    warnings.push(
      createRiskWarning(
        "missing_contract_value",
        "Contract value is missing, so exposure-related risk is understated.",
        "warning"
      )
    );
  }

  if (input.autoRenewalConfirmed === null) {
    warnings.push(
      createRiskWarning(
        "missing_auto_renewal_confirmation",
        "Auto-renewal is not confirmed, so auto-renewal risk is lower-confidence.",
        "warning"
      )
    );
  }

  if (!input.reviewCompleted) {
    warnings.push(
      createRiskWarning(
        "review_pending",
        "P0 review is incomplete, so this score cannot be high-confidence.",
        "critical"
      )
    );
  }

  if (input.weakEvidence) {
    warnings.push(
      createRiskWarning(
        "weak_evidence",
        "Evidence is weak, so this score should be treated as lower-confidence.",
        "warning"
      )
    );
  }

  return warnings;
}

function scored(code: string, points: number, detail: string, source: string): ScoredRiskFactor {
  return {
    code,
    points,
    detail,
    evidence: {
      factor: code,
      source,
      trusted: true
    }
  };
}
