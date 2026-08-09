import { RENEWAL_READINESS_CONFIDENCE_THRESHOLD } from "@/lib/contracts/readiness-score";
import {
  evaluateTrustedReminderGate,
  type TrustedReminderGateResult
} from "@/lib/contracts/trusted-reminder-gate";
import {
  buildTrustExceptionApprovalGateEvidence,
  isTrustExceptionApprovalActive,
  type TrustExceptionApproval
} from "@/lib/contracts/trust-exception-approvals";
import {
  calculateActivationScore,
  type ActivationScore
} from "@/lib/onboarding/activation-score";
import {
  deriveActivationNextBestAction,
  type ActivationNextBestAction
} from "@/lib/onboarding/next-best-action";

export type OrganizationActivationStateId =
  | "empty_workspace"
  | "contracts_imported"
  | "contract_selected"
  | "owner_assigned"
  | "renewal_date_confirmed"
  | "notice_deadline_confirmed"
  | "evidence_attached"
  | "evidence_reviewed"
  | "exception_approval_required"
  | "exception_approval_pending"
  | "trusted_reminder_ready"
  | "first_trusted_reminder_active"
  | "activated";

export type ActivationRiskLevel = "low" | "medium" | "high" | "critical";

export type ActivationContractMetadata = {
  contract_title?: string | null;
  renewal_date?: string | null;
  notice_deadline_date?: string | null;
  expiration_date?: string | null;
  auto_renewal?: boolean | null;
  needs_review?: boolean | null;
  has_weak_evidence?: boolean | null;
  accepted_unverified_risk_requested?: boolean | null;
  field_confidence?: Record<string, number> | null;
};

export type ActivationContractReminder = {
  status?: string | null;
  remind_at?: string | null;
};

export type ActivationContractDecision = {
  id?: string | null;
  status?: string | null;
};

export type ActivationContractInput = {
  id: string;
  owner_user_id?: string | null;
  contract_metadata?: ActivationContractMetadata | ActivationContractMetadata[] | null;
  reminders?: ActivationContractReminder[] | null;
  renewal_decisions?: ActivationContractDecision[] | null;
  contract_trust_exception_approvals?: TrustExceptionApproval[] | null;
};

export type ActivationContractAssessment = {
  contractId: string;
  title: string;
  ownerAssigned: boolean;
  renewalDateReviewed: boolean;
  noticeDeadlineReviewed: boolean;
  autoRenewTermsReviewed: boolean;
  evidenceAttached: boolean;
  evidenceReviewed: boolean;
  evidenceConfidence: number;
  evidenceTrusted: boolean;
  trustExceptionApprovalRequested: boolean;
  hasActiveTrustExceptionApproval: boolean;
  hasActiveTrustedReminder: boolean;
  hasRenewalDecision: boolean;
  daysToNoticeDeadline: number | null;
  requiredEvidenceFields: string[];
  trustedReminderGate: TrustedReminderGateResult;
  score: ActivationScore;
};

export type OrganizationActivationState = {
  currentState: OrganizationActivationStateId;
  percentComplete: number;
  blockingReasons: string[];
  nextBestAction: ActivationNextBestAction;
  recommendedContractId: string | null;
  recommendedContractTitle: string | null;
  requiredEvidenceFields: string[];
  riskLevel: ActivationRiskLevel;
  daysToNoticeDeadline: number | null;
  hasActiveTrustedReminder: boolean;
  hasActiveTrustExceptionApproval: boolean;
  completedSteps: OrganizationActivationStateId[];
  remainingSteps: OrganizationActivationStateId[];
  contractAssessments: ActivationContractAssessment[];
};

const ACTIVATION_PATH: OrganizationActivationStateId[] = [
  "contracts_imported",
  "contract_selected",
  "owner_assigned",
  "renewal_date_confirmed",
  "notice_deadline_confirmed",
  "evidence_attached",
  "evidence_reviewed",
  "trusted_reminder_ready",
  "first_trusted_reminder_active",
  "activated"
];

const ACTIVE_REMINDER_STATUSES = new Set(["pending", "queued", "scheduled", "retry_pending", "sent"]);

function firstMetadata(
  metadata: ActivationContractInput["contract_metadata"]
): ActivationContractMetadata {
  if (Array.isArray(metadata)) return metadata[0] ?? {};
  return metadata ?? {};
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function getEvidenceConfidence(metadata: ActivationContractMetadata) {
  const confidences = Object.values(metadata.field_confidence ?? {}).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (metadata.needs_review || metadata.has_weak_evidence) return 0;
  if (confidences.length === 0) return 0.5;
  return clampConfidence(Math.min(...confidences));
}

function parseDateOnly(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === day
    ? parsed
    : null;
}

function daysUntil(date: string | null | undefined, now: Date) {
  const parsed = parseDateOnly(date);
  if (!parsed) return null;
  return Math.ceil((parsed.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

function hasActiveReminder(reminders: ActivationContractReminder[] | null | undefined) {
  return (reminders ?? []).some((reminder) =>
    ACTIVE_REMINDER_STATUSES.has(String(reminder.status ?? "").toLowerCase())
  );
}

function getRequiredEvidenceFields(metadata: ActivationContractMetadata) {
  const confidence = metadata.field_confidence ?? {};
  return ["renewal_date", "notice_deadline_date", "auto_renewal"].filter((field) => {
    const value = confidence[field];
    return typeof value !== "number" || value < RENEWAL_READINESS_CONFIDENCE_THRESHOLD;
  });
}

function assessContract(
  contract: ActivationContractInput,
  now: Date
): ActivationContractAssessment {
  const metadata = firstMetadata(contract.contract_metadata);
  const activeApproval =
    [...(contract.contract_trust_exception_approvals ?? [])]
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .find((approval) => isTrustExceptionApprovalActive(approval, now)) ?? null;
  const evidenceConfidence = getEvidenceConfidence(metadata);
  const reviewedRenewalDate = parseDateOnly(metadata.renewal_date) ? metadata.renewal_date ?? null : null;
  const reviewedNoticeDeadline = parseDateOnly(metadata.notice_deadline_date)
    ? metadata.notice_deadline_date ?? null
    : null;
  const ownerAssigned = Boolean(contract.owner_user_id);
  const renewalDateReviewed = !metadata.needs_review && Boolean(reviewedRenewalDate);
  const noticeDeadlineReviewed = !metadata.needs_review && Boolean(reviewedNoticeDeadline);
  const autoRenewTermsReviewed = !metadata.needs_review && metadata.auto_renewal !== null && metadata.auto_renewal !== undefined;
  const evidenceAttached = Object.keys(metadata.field_confidence ?? {}).length > 0;
  const evidenceReviewed = !metadata.needs_review;
  const evidenceTrusted =
    evidenceConfidence >= RENEWAL_READINESS_CONFIDENCE_THRESHOLD || Boolean(activeApproval);
  const hasActiveTrustedReminder = hasActiveReminder(contract.reminders);
  const hasRenewalDecision = (contract.renewal_decisions ?? []).some((decision) =>
    Boolean(decision.id ?? decision.status)
  );

  const trustedReminderGate = evaluateTrustedReminderGate({
    contractId: contract.id,
    ownerUserId: contract.owner_user_id ?? null,
    renewalDate: reviewedRenewalDate,
    noticeDeadline: reviewedNoticeDeadline,
    autoRenewReviewed: autoRenewTermsReviewed,
    p0FieldsReviewed: evidenceReviewed,
    evidenceConfidence,
    leadDays: [90, 60, 30],
    unverifiedRiskApprovalRequested: Boolean(metadata.accepted_unverified_risk_requested),
    trustExceptionApproval: activeApproval
      ? buildTrustExceptionApprovalGateEvidence(activeApproval, now)
      : null
  });

  return {
    contractId: contract.id,
    title: metadata.contract_title ?? "Untitled contract",
    ownerAssigned,
    renewalDateReviewed,
    noticeDeadlineReviewed,
    autoRenewTermsReviewed,
    evidenceAttached,
    evidenceReviewed,
    evidenceConfidence,
    evidenceTrusted,
    trustExceptionApprovalRequested: Boolean(metadata.accepted_unverified_risk_requested),
    hasActiveTrustExceptionApproval: Boolean(activeApproval),
    hasActiveTrustedReminder,
    hasRenewalDecision,
    daysToNoticeDeadline: daysUntil(reviewedNoticeDeadline, now),
    requiredEvidenceFields: getRequiredEvidenceFields(metadata),
    trustedReminderGate,
    score: calculateActivationScore({
      hasContractImported: true,
      ownerAssigned,
      renewalDateReviewed,
      noticeDeadlineReviewed,
      autoRenewTermsReviewed,
      evidenceTrusted,
      trustedReminderActive: hasActiveTrustedReminder && trustedReminderGate.canActivate
    })
  };
}

function rankAssessment(assessment: ActivationContractAssessment) {
  const dueWeight =
    assessment.daysToNoticeDeadline === null
      ? 40
      : assessment.daysToNoticeDeadline < 0
        ? -100
        : Math.min(40, assessment.daysToNoticeDeadline);
  return assessment.score.score * 10 - dueWeight;
}

function getCurrentState(input: {
  totalContracts: number;
  assessment: ActivationContractAssessment | null;
}): OrganizationActivationStateId {
  const assessment = input.assessment;
  if (input.totalContracts === 0 || !assessment) return "empty_workspace";
  if (assessment.hasActiveTrustedReminder && assessment.trustedReminderGate.canActivate) return "activated";
  if (assessment.trustedReminderGate.canActivate) return "trusted_reminder_ready";
  if (!assessment.ownerAssigned) return "contracts_imported";
  if (!assessment.renewalDateReviewed) return "owner_assigned";
  if (!assessment.noticeDeadlineReviewed) return "renewal_date_confirmed";
  if (!assessment.autoRenewTermsReviewed) return "notice_deadline_confirmed";
  if (!assessment.evidenceAttached) return "evidence_attached";
  if (!assessment.evidenceReviewed) return "evidence_attached";
  if (!assessment.evidenceTrusted && assessment.trustExceptionApprovalRequested) return "exception_approval_pending";
  if (!assessment.evidenceTrusted) return "exception_approval_required";
  return "evidence_reviewed";
}

function getCompletedSteps(
  totalContracts: number,
  assessment: ActivationContractAssessment | null
) {
  const completed = new Set<OrganizationActivationStateId>();
  if (totalContracts > 0) {
    completed.add("contracts_imported");
    completed.add("contract_selected");
  }
  if (assessment?.ownerAssigned) completed.add("owner_assigned");
  if (assessment?.renewalDateReviewed) completed.add("renewal_date_confirmed");
  if (assessment?.noticeDeadlineReviewed) completed.add("notice_deadline_confirmed");
  if (assessment?.evidenceAttached) completed.add("evidence_attached");
  if (assessment?.evidenceReviewed) completed.add("evidence_reviewed");
  if (assessment?.trustedReminderGate.canActivate) completed.add("trusted_reminder_ready");
  if (assessment?.hasActiveTrustedReminder && assessment.trustedReminderGate.canActivate) {
    completed.add("first_trusted_reminder_active");
    completed.add("activated");
  }
  return ACTIVATION_PATH.filter((step) => completed.has(step));
}

function getBlockingReasons(assessment: ActivationContractAssessment | null) {
  if (!assessment) return ["Import or create the first renewal contract."];

  return assessment.trustedReminderGate.failures.map((failure) => failure.message);
}

function getRiskLevel(
  assessment: ActivationContractAssessment | null,
  currentState: OrganizationActivationStateId
): ActivationRiskLevel {
  if (!assessment || currentState === "empty_workspace") return "medium";
  if (assessment.daysToNoticeDeadline !== null && assessment.daysToNoticeDeadline < 0) return "critical";
  if (assessment.daysToNoticeDeadline !== null && assessment.daysToNoticeDeadline <= 14) return "critical";
  if (assessment.trustedReminderGate.failures.length > 0) return "high";
  if (!assessment.hasActiveTrustedReminder) return "medium";
  return "low";
}

export function buildOrganizationActivationState(input: {
  organizationId: string;
  contracts: ActivationContractInput[];
  now?: Date;
}): OrganizationActivationState {
  const now = input.now ?? new Date();
  const contractAssessments = input.contracts.map((contract) => assessContract(contract, now));
  const recommended =
    [...contractAssessments].sort((left, right) => rankAssessment(right) - rankAssessment(left))[0] ?? null;
  const completedSteps = getCompletedSteps(input.contracts.length, recommended);
  const currentState = getCurrentState({
    totalContracts: input.contracts.length,
    assessment: recommended
  });
  const nextBestAction = deriveActivationNextBestAction({
    totalContracts: input.contracts.length,
    recommendedContractId: recommended?.contractId ?? null,
    contractTitle: recommended?.title ?? null,
    ownerAssigned: recommended?.ownerAssigned ?? false,
    renewalDateReviewed: recommended?.renewalDateReviewed ?? false,
    noticeDeadlineReviewed: recommended?.noticeDeadlineReviewed ?? false,
    autoRenewTermsReviewed: recommended?.autoRenewTermsReviewed ?? false,
    evidenceAttached: recommended?.evidenceAttached ?? false,
    evidenceReviewed: recommended?.evidenceReviewed ?? false,
    evidenceTrusted: recommended?.evidenceTrusted ?? false,
    trustExceptionApprovalRequested: recommended?.trustExceptionApprovalRequested ?? false,
    hasActiveTrustExceptionApproval: recommended?.hasActiveTrustExceptionApproval ?? false,
    trustedReminderGateBlocked: !(recommended?.trustedReminderGate.canActivate ?? false),
    hasActiveTrustedReminder: recommended?.hasActiveTrustedReminder ?? false,
    daysToNoticeDeadline: recommended?.daysToNoticeDeadline ?? null
  });

  return {
    currentState,
    percentComplete: recommended?.score.score ?? 0,
    blockingReasons: getBlockingReasons(recommended),
    nextBestAction,
    recommendedContractId: recommended?.contractId ?? null,
    recommendedContractTitle: recommended?.title ?? null,
    requiredEvidenceFields: recommended?.requiredEvidenceFields ?? [],
    riskLevel: getRiskLevel(recommended, currentState),
    daysToNoticeDeadline: recommended?.daysToNoticeDeadline ?? null,
    hasActiveTrustedReminder: Boolean(recommended?.hasActiveTrustedReminder),
    hasActiveTrustExceptionApproval: Boolean(recommended?.hasActiveTrustExceptionApproval),
    completedSteps,
    remainingSteps: ACTIVATION_PATH.filter((step) => !completedSteps.includes(step)),
    contractAssessments
  };
}
