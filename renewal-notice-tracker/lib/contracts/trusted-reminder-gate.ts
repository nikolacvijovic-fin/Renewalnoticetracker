import { RENEWAL_READINESS_CONFIDENCE_THRESHOLD } from "@/lib/contracts/readiness-score";

export type TrustedReminderGateCode =
  | "missing_owner"
  | "missing_renewal_date"
  | "missing_notice_deadline"
  | "auto_renew_unreviewed"
  | "p0_unreviewed"
  | "low_confidence"
  | "invalid_schedule";

export type TrustedReminderGateInput = {
  contractId: string;
  ownerUserId: string | null;
  renewalDate: string | null;
  noticeDeadline: string | null;
  autoRenewReviewed: boolean;
  p0FieldsReviewed: boolean;
  evidenceConfidence: number;
  leadDays: readonly number[];
  humanReviewOverride?: boolean;
};

export type TrustedReminderGateFailure = {
  code: TrustedReminderGateCode;
  message: string;
  remediation: string;
};

export type TrustedReminderGateResult = {
  canActivate: boolean;
  failures: TrustedReminderGateFailure[];
  auditMetadata: {
    contractId: string;
    failureCount: number;
    evidenceConfidence: number;
    humanReviewOverride: boolean;
  };
};

export function evaluateTrustedReminderGate(
  input: TrustedReminderGateInput
): TrustedReminderGateResult {
  const failures: TrustedReminderGateFailure[] = [];
  const evidenceConfidence = clampConfidence(input.evidenceConfidence);

  if (!input.ownerUserId) {
    failures.push({
      code: "missing_owner",
      message: "Trusted reminders need one accountable owner.",
      remediation: "Assign an owner before enabling the reminder clock."
    });
  }

  if (!input.renewalDate) {
    failures.push({
      code: "missing_renewal_date",
      message: "The renewal date has not been confirmed.",
      remediation: "Review the renewal date in the P0 review panel."
    });
  }

  if (!input.noticeDeadline) {
    failures.push({
      code: "missing_notice_deadline",
      message: "The notice deadline has not been confirmed.",
      remediation: "Review the opt-out or notice deadline before relying on reminders."
    });
  }

  if (!input.autoRenewReviewed) {
    failures.push({
      code: "auto_renew_unreviewed",
      message: "Auto-renewal status has not been reviewed.",
      remediation: "Confirm whether the contract auto-renews."
    });
  }

  if (!input.p0FieldsReviewed) {
    failures.push({
      code: "p0_unreviewed",
      message: "P0 contract truth is still pending review.",
      remediation: "Complete P0 review before trusting workflow automation."
    });
  }

  if (
    evidenceConfidence < RENEWAL_READINESS_CONFIDENCE_THRESHOLD &&
    !input.humanReviewOverride
  ) {
    failures.push({
      code: "low_confidence",
      message: "The extracted evidence confidence is too low for trusted reminders.",
      remediation: "Review the evidence or explicitly accept the unverified risk."
    });
  }

  if (input.leadDays.length === 0 || input.leadDays.some((day) => day < 0)) {
    failures.push({
      code: "invalid_schedule",
      message: "The reminder schedule is missing or invalid.",
      remediation: "Use a non-negative reminder lead-day schedule."
    });
  }

  return {
    canActivate: failures.length === 0,
    failures,
    auditMetadata: {
      contractId: input.contractId,
      failureCount: failures.length,
      evidenceConfidence,
      humanReviewOverride: Boolean(input.humanReviewOverride)
    }
  };
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
