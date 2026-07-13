export type ActivationScoreInput = {
  hasContractImported: boolean;
  ownerAssigned: boolean;
  renewalDateReviewed: boolean;
  noticeDeadlineReviewed: boolean;
  autoRenewTermsReviewed: boolean;
  evidenceTrusted: boolean;
  trustedReminderActive: boolean;
};

export type ActivationScore = {
  score: number;
  rawScore: number;
  caps: string[];
};

export function calculateActivationScore(input: ActivationScoreInput): ActivationScore {
  const rawScore =
    (input.hasContractImported ? 15 : 0) +
    (input.ownerAssigned ? 10 : 0) +
    (input.renewalDateReviewed ? 15 : 0) +
    (input.noticeDeadlineReviewed ? 15 : 0) +
    (input.autoRenewTermsReviewed ? 15 : 0) +
    (input.evidenceTrusted ? 15 : 0) +
    (input.trustedReminderActive ? 15 : 0);

  let score = rawScore;
  const caps: string[] = [];

  if (!input.noticeDeadlineReviewed && score >= 70) {
    score = 69;
    caps.push("notice_deadline_required");
  }

  if (!input.evidenceTrusted && score >= 85) {
    score = 84;
    caps.push("trusted_evidence_or_approval_required");
  }

  if (!input.trustedReminderActive && score >= 95) {
    score = 94;
    caps.push("active_trusted_reminder_required");
  }

  if (!input.trustedReminderActive && score === 100) {
    score = 94;
    caps.push("activation_requires_trusted_reminder");
  }

  return {
    score,
    rawScore,
    caps
  };
}
