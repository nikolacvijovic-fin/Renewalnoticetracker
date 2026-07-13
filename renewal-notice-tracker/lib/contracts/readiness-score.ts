export const RENEWAL_READINESS_CONFIDENCE_THRESHOLD = 0.75;

export type RenewalReadinessLabel =
  | "not_ready"
  | "needs_review"
  | "mostly_ready"
  | "ready";

export type RenewalReadinessComponentKey =
  | "owner"
  | "renewal_date"
  | "notice_deadline"
  | "auto_renew"
  | "evidence"
  | "trusted_reminder"
  | "decision";

export type RenewalReadinessInput = {
  ownerAssigned: boolean;
  renewalDateReviewed: boolean;
  noticeDeadlineReviewed: boolean;
  autoRenewReviewed: boolean;
  evidenceConfidence: number;
  approvedUnverifiedRiskOverride?: boolean;
  trustedReminderActive: boolean;
  trustedReminderGateBlocked?: boolean;
  decisionRecorded: boolean;
  daysToNotice: number | null;
};

export type RenewalReadinessComponent = {
  key: RenewalReadinessComponentKey;
  label: string;
  points: number;
  max: number;
  passed: boolean;
  blocker: string;
  exception: string | null;
};

export type RenewalReadinessScore = {
  score: number;
  label: RenewalReadinessLabel;
  components: RenewalReadinessComponent[];
  blockers: string[];
  nextAction: string;
};

export function calculateRenewalReadiness(
  input: RenewalReadinessInput
): RenewalReadinessScore {
  const evidenceConfidence = clampConfidence(input.evidenceConfidence);
  const evidenceTrusted =
    evidenceConfidence >= RENEWAL_READINESS_CONFIDENCE_THRESHOLD ||
    Boolean(input.approvedUnverifiedRiskOverride);
  const evidenceAllowedByOverride =
    evidenceConfidence < RENEWAL_READINESS_CONFIDENCE_THRESHOLD &&
    Boolean(input.approvedUnverifiedRiskOverride);
  const components: RenewalReadinessComponent[] = [
    {
      key: "owner",
      label: "Accountable owner",
      points: input.ownerAssigned ? 15 : 0,
      max: 15,
      passed: input.ownerAssigned,
      blocker: "Assign one accountable owner.",
      exception: null
    },
    {
      key: "renewal_date",
      label: "Renewal date reviewed",
      points: input.renewalDateReviewed ? 20 : 0,
      max: 20,
      passed: input.renewalDateReviewed,
      blocker: "Review and confirm the renewal date.",
      exception: null
    },
    {
      key: "notice_deadline",
      label: "Notice deadline reviewed",
      points: input.noticeDeadlineReviewed ? 20 : 0,
      max: 20,
      passed: input.noticeDeadlineReviewed,
      blocker: "Review and confirm the notice deadline.",
      exception: null
    },
    {
      key: "auto_renew",
      label: "Auto-renewal reviewed",
      points: input.autoRenewReviewed ? 10 : 0,
      max: 10,
      passed: input.autoRenewReviewed,
      blocker: "Confirm whether auto-renewal applies.",
      exception: null
    },
    {
      key: "evidence",
      label: "Evidence or approved override",
      points: evidenceTrusted ? 15 : 0,
      max: 15,
      passed: evidenceTrusted,
      blocker: input.approvedUnverifiedRiskOverride
        ? "Approved unverified-risk override is recorded."
        : "Resolve low-confidence extracted evidence before trusting the clock.",
      exception: evidenceAllowedByOverride
        ? "Low-confidence evidence accepted by approved human trust exception."
        : null
    },
    {
      key: "trusted_reminder",
      label: "Trusted reminder active",
      points: input.trustedReminderActive && !input.trustedReminderGateBlocked ? 15 : 0,
      max: 15,
      passed: input.trustedReminderActive && !input.trustedReminderGateBlocked,
      blocker: input.trustedReminderGateBlocked
        ? "Trusted reminder gate is blocked."
        : "Activate the trusted reminder schedule.",
      exception: null
    },
    {
      key: "decision",
      label: "Decision recorded",
      points: input.decisionRecorded ? 5 : 0,
      max: 5,
      passed: input.decisionRecorded,
      blocker: "Record the renewal decision when the decision window opens.",
      exception: null
    }
  ];

  const urgentNoticePenalty =
    input.daysToNotice !== null &&
    input.daysToNotice < 30 &&
    !input.noticeDeadlineReviewed
      ? 15
      : 0;
  const rawScore =
    components.reduce((total, component) => total + component.points, 0) -
    urgentNoticePenalty;
  const score = Math.max(
    0,
    Math.min(input.trustedReminderGateBlocked ? 69 : 100, rawScore)
  );
  const blockers = components
    .filter((component) => !component.passed)
    .map((component) => component.blocker);

  return {
    score,
    label: getRenewalReadinessLabel(score),
    components,
    blockers,
    nextAction: blockers[0] ?? "Keep the renewal decision history current."
  };
}

export function getRenewalReadinessLabel(score: number): RenewalReadinessLabel {
  if (score >= 90) return "ready";
  if (score >= 70) return "mostly_ready";
  if (score >= 40) return "needs_review";
  return "not_ready";
}

export function getDaysUntilDate(
  isoDate: string | null | undefined,
  now: Date = new Date()
) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;

  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
