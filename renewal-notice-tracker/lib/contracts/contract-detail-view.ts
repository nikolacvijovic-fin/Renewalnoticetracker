import type { ActiveOrganizationContext } from "@/lib/auth";
import {
  getPhase1ReviewMode,
  getPhase1TrustState,
  listPhase1ActiveReviewDirtyFlags
} from "@/lib/contracts/phase1-pilot";
import {
  formatReminderRuntimeStatusLabel,
  formatReminderTypeLabel,
  getReminderActivationState,
  type ReminderActivationState
} from "@/lib/contracts/shipped-reminder-policy";
import {
  calculateRenewalReadiness,
  getDaysUntilDate,
  type RenewalReadinessScore
} from "@/lib/contracts/readiness-score";
import {
  evaluateTrustedReminderGate,
  type TrustedReminderGateResult
} from "@/lib/contracts/trusted-reminder-gate";
import {
  deriveRenewalDecisionLoop,
  type RenewalDecisionLoop
} from "@/lib/contracts/decision-loop";
import {
  buildTrustExceptionApprovalGateEvidence,
  isTrustExceptionApprovalActive,
  type TrustExceptionApproval
} from "@/lib/contracts/trust-exception-approvals";
import type {
  CounterpartyRecord,
  OrganizationMember
} from "@/lib/contracts/kernel-queries";
import {
  buildRiskQueueRow,
  type RiskQueueRow
} from "@/lib/intelligence/risk/dashboard";
import { getIntelligenceSurfaceAccessMap } from "@/lib/intelligence/access";
import { formatDate } from "@/lib/utils";

type ContractDetailRecord = NonNullable<
  Awaited<ReturnType<(typeof import("@/lib/contracts/kernel-queries"))["getContractById"]>>
>;

const TRUSTED_REMINDER_GATE_LEAD_DAYS = [90, 60, 30] as const;

export type ContractPageMetadata = Record<string, unknown> & {
  contract_title: string | null;
  counterparty_name: string | null;
  needs_review: boolean | null;
  notice_deadline_date: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  termination_window: string | null;
  auto_renewal: boolean | null;
  has_conflict?: boolean | null;
  has_derived_date?: boolean | null;
  has_weak_evidence?: boolean | null;
  is_ocr_assisted?: boolean | null;
  is_manual_without_evidence?: boolean | null;
  changes_previously_verified_p0?: boolean | null;
  accepted_unverified_risk_requested?: boolean | null;
  accepted_unverified_risk_approved_at?: string | null;
  accepted_unverified_risk_approved_by?: string | null;
  accepted_unverified_risk_approval_reason?: string | null;
  contract_template_key?: string | null;
  price_change_trigger?: string | null;
  contract_value_amount?: number | null;
  field_confidence: Record<string, number>;
  field_source_snippets: Record<string, string>;
};

export type ContractDetailNextAction = {
  label: string;
  help: string;
};

export type ContractDetailWorkflowItem = {
  label: string;
  value: string;
  help: string;
};

export type ContractDetailReminder = {
  remind_at: string;
  reminder_type: string;
  status: string;
  source: string;
};

export type ContractDetailViewModel = {
  metadata: ContractPageMetadata;
  title: string;
  counterpartyName: string;
  latestFileExtractionSource: string | null;
  ocrAssisted: boolean;
  ownerLabel: string;
  memberLabels: Array<{ user_id: string; label: string }>;
  actorLabels: Record<string, string>;
  trustState: string;
  reviewMode: string;
  dirtyReviewFlags: Array<{ key: string; label: string; impact: string }>;
  reviewBlocked: boolean;
  ownerBlocked: boolean;
  reviewMetadata: ContractPageMetadata & {
    owner_user_id: string | null;
    department: string | null;
    status_tag: string | null;
    is_ocr_assisted: boolean;
    renewal_decision_status: string | null;
    renewal_decision_date: string | null;
    cycle_status: string | null;
  };
  nextReminder: ContractDetailReminder | null;
  reminderActivationState: ReminderActivationState;
  reminderBlockedReason: Exclude<ReminderActivationState, "scheduled" | "failed" | "superseded"> | null;
  nextAction: ContractDetailNextAction;
  workflowItems: ContractDetailWorkflowItem[];
  ownerReadiness: {
    ownerStatus: string;
    ownerHelp: string;
    reminderStatus: string;
    reminderHelp: string;
  };
  readinessScore: RenewalReadinessScore;
  trustedReminderGate: TrustedReminderGateResult;
  trustExceptionApproval: TrustExceptionApproval | null;
  trustExceptionApprovalState: ContractDetailTrustExceptionApprovalState;
  decisionLoop: RenewalDecisionLoop;
  riskExplanation: RiskQueueRow;
  intelligenceAccess: Awaited<ReturnType<typeof getIntelligenceSurfaceAccessMap>>;
};

export type ContractDetailTrustExceptionApprovalState = {
  status: "none" | "requested" | "active" | "expired" | "revoked";
  approval: TrustExceptionApproval | null;
  legacyApproval: {
    approvedAt: string | null;
    approvedBy: string | null;
    approvalReason: string | null;
  } | null;
  label: string;
  help: string;
};

function firstValue<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function deriveContractDetailTrustExceptionApprovalState(input: {
  approvals: TrustExceptionApproval[];
  activeApproval: TrustExceptionApproval | null;
  metadata: ContractPageMetadata;
}): ContractDetailTrustExceptionApprovalState {
  const legacyApproval = hasApprovedUnverifiedRiskOverride(input.metadata)
    ? {
        approvedAt: input.metadata.accepted_unverified_risk_approved_at ?? null,
        approvedBy: input.metadata.accepted_unverified_risk_approved_by ?? null,
        approvalReason: input.metadata.accepted_unverified_risk_approval_reason ?? null
      }
    : null;

  if (input.activeApproval) {
    return {
      status: "active",
      approval: input.activeApproval,
      legacyApproval,
      label: `Low-confidence evidence approved by ${input.activeApproval.approved_by_user_id} on ${formatDate(input.activeApproval.created_at)}`,
      help: "Trusted reminders may proceed because a durable trust exception approval is active. Evidence confidence itself is unchanged."
    };
  }

  const latestApproval = [...input.approvals].sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  )[0] ?? null;

  if (latestApproval?.revoked_at) {
    return {
      status: "revoked",
      approval: latestApproval,
      legacyApproval,
      label: `Approval revoked on ${formatDate(latestApproval.revoked_at)}`,
      help: "Revoked approvals do not unlock trusted reminders."
    };
  }

  if (latestApproval?.expires_at) {
    return {
      status: "expired",
      approval: latestApproval,
      legacyApproval,
      label: `Approval expired on ${formatDate(latestApproval.expires_at)}`,
      help: "Expired approvals do not unlock trusted reminders."
    };
  }

  if (input.metadata.accepted_unverified_risk_requested) {
    return {
      status: "requested",
      approval: null,
      legacyApproval,
      label: "Approval requested, not yet approved",
      help: "Trusted reminders stay blocked until a durable approval record is granted or evidence improves."
    };
  }

  return {
    status: "none",
    approval: null,
    legacyApproval,
    label: legacyApproval ? "Legacy approval metadata present" : "No trust exception approval",
    help: legacyApproval
      ? "Legacy metadata is shown as historical context only. It does not unlock trusted reminders."
      : "Low-confidence evidence requires a durable human approval before trusted reminders can proceed."
  };
}

export function normalizeContractDetailMetadata(
  metadata: Record<string, unknown>
): ContractPageMetadata {
  return {
    ...metadata,
    contract_title: (metadata.contract_title as string | null | undefined) ?? null,
    counterparty_name: (metadata.counterparty_name as string | null | undefined) ?? null,
    needs_review: (metadata.needs_review as boolean | null | undefined) ?? null,
    notice_deadline_date: (metadata.notice_deadline_date as string | null | undefined) ?? null,
    renewal_date: (metadata.renewal_date as string | null | undefined) ?? null,
    expiration_date: (metadata.expiration_date as string | null | undefined) ?? null,
    termination_window: (metadata.termination_window as string | null | undefined) ?? null,
    auto_renewal: (metadata.auto_renewal as boolean | null | undefined) ?? null,
    has_conflict: (metadata.has_conflict as boolean | null | undefined) ?? false,
    has_derived_date: (metadata.has_derived_date as boolean | null | undefined) ?? false,
    has_weak_evidence: (metadata.has_weak_evidence as boolean | null | undefined) ?? false,
    is_ocr_assisted: (metadata.is_ocr_assisted as boolean | null | undefined) ?? false,
    is_manual_without_evidence:
      (metadata.is_manual_without_evidence as boolean | null | undefined) ?? false,
    changes_previously_verified_p0:
      (metadata.changes_previously_verified_p0 as boolean | null | undefined) ?? false,
    accepted_unverified_risk_requested:
      (metadata.accepted_unverified_risk_requested as boolean | null | undefined) ?? false,
    accepted_unverified_risk_approved_at:
      (metadata.accepted_unverified_risk_approved_at as string | null | undefined) ?? null,
    accepted_unverified_risk_approved_by:
      (metadata.accepted_unverified_risk_approved_by as string | null | undefined) ?? null,
    accepted_unverified_risk_approval_reason:
      (metadata.accepted_unverified_risk_approval_reason as string | null | undefined) ?? null,
    contract_template_key:
      (metadata.contract_template_key as string | null | undefined) ?? null,
    price_change_trigger:
      (metadata.price_change_trigger as string | null | undefined) ?? null,
    contract_value_amount:
      typeof metadata.contract_value_amount === "number"
        ? (metadata.contract_value_amount as number)
        : null,
    field_confidence:
      typeof metadata.field_confidence === "object" && metadata.field_confidence !== null
        ? (metadata.field_confidence as Record<string, number>)
        : {},
    field_source_snippets:
      typeof metadata.field_source_snippets === "object" &&
      metadata.field_source_snippets !== null
        ? (metadata.field_source_snippets as Record<string, string>)
        : {}
  };
}

export function getContractDetailOwnerLabel(
  ownerUserId: string | null,
  members: OrganizationMember[]
) {
  if (!ownerUserId) {
    return "Unassigned";
  }

  const match = members.find((member) => member.user_id === ownerUserId);
  return match?.user?.full_name ?? match?.user?.notification_email ?? "Assigned";
}

export function getContractDetailNextReminder(reminders: ContractDetailReminder[]) {
  return [...reminders]
    .filter((reminder) => reminder.status !== "superseded" && reminder.status !== "cancelled")
    .sort((left, right) => left.remind_at.localeCompare(right.remind_at))[0] ?? null;
}

export function deriveContractDetailNextAction(input: {
  trustState: string;
  reviewBlocked: boolean;
  ownerBlocked: boolean;
  cycleStatus: string | null | undefined;
  renewalDecisionStatus: string | null | undefined;
}) {
  if (input.reviewBlocked) {
    return {
      label: "Complete P0 review",
      help: "Confirm the notice deadline, renewal date, expiration date, termination window, and auto-renewal flag before this contract can drive trusted reminders."
    };
  }

  if (input.ownerBlocked) {
    return {
      label: "Assign the accountable owner",
      help: "Trusted reminders stay blocked until one named owner can acknowledge high-risk reminders and make the renewal decision."
    };
  }

  if ((input.cycleStatus ?? "open") === "awaiting_acknowledgment") {
    return {
      label: "Record acknowledgment",
      help: "This cycle is waiting for an explicit acknowledgment before the decision work can continue."
    };
  }

  if (
    (input.renewalDecisionStatus ?? "undecided") === "undecided" &&
    ["Decision Needed", "Due Soon", "Overdue Action"].includes(input.trustState)
  ) {
    return {
      label: "Record the renewal decision",
      help: "The contract is in the decision window. Capture renew, terminate, renegotiate, defer, or no-action-required to move the cycle forward."
    };
  }

  if ((input.cycleStatus ?? "open") === "closed") {
    return {
      label: "Monitor the next cycle",
      help: "The current cycle is closed. Use the timeline and audit trail only if support needs to verify what happened."
    };
  }

  return {
    label: "Monitor the trusted reminder timeline",
    help: "Review is complete, an owner is assigned, and the contract is ready for the weekly operator loop."
  };
}

export function getContractDetailReminderBlockedReason(
  reminderActivationState: ReminderActivationState
) {
  return reminderActivationState === "scheduled" ||
    reminderActivationState === "failed" ||
    reminderActivationState === "superseded"
    ? null
    : reminderActivationState;
}

export function getContractDetailEvidenceConfidence(metadata: ContractPageMetadata) {
  const values = Object.values(metadata.field_confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .map((value) => Math.max(0, Math.min(1, value)));

  if (values.length === 0) {
    if (
      metadata.needs_review ||
      metadata.has_weak_evidence ||
      metadata.is_manual_without_evidence
    ) {
      return 0;
    }

    return 0.5;
  }

  return Math.min(...values);
}

export function hasApprovedUnverifiedRiskOverride(metadata: ContractPageMetadata) {
  return Boolean(
    metadata.accepted_unverified_risk_approved_at &&
      metadata.accepted_unverified_risk_approved_by
  );
}

export function isContractDetailDecisionRecorded(value: string | null | undefined) {
  return normalizeDecisionStatus(value) !== "undecided";
}

export async function buildContractDetailViewModel(input: {
  context: ActiveOrganizationContext;
  contract: ContractDetailRecord;
  members: OrganizationMember[];
  counterparties: CounterpartyRecord[];
  trustExceptionApproval?: TrustExceptionApproval | null;
}) {
  const metadataRow = firstValue(input.contract.contract_metadata);
  if (!metadataRow) {
    throw new Error("Contract detail metadata is required.");
  }

  const metadata = normalizeContractDetailMetadata(metadataRow as Record<string, unknown>);
  const latestFile = [...(input.contract.contract_files ?? [])].sort(
    (left, right) =>
      new Date(right.uploaded_at).getTime() - new Date(left.uploaded_at).getTime()
  )[0];
  const ocrAssisted = metadata.is_ocr_assisted || latestFile?.extraction_source === "ocr";
  const ownerLabel = getContractDetailOwnerLabel(
    input.contract.owner_user_id ?? null,
    input.members
  );
  const reviewMetadata = {
    ...metadata,
    owner_user_id: input.contract.owner_user_id,
    department: input.contract.department,
    status_tag: input.contract.status_tag,
    is_ocr_assisted: ocrAssisted,
    renewal_decision_status: input.contract.renewal_decision_status,
    renewal_decision_date: input.contract.renewal_decision_date,
    cycle_status: input.contract.cycle_status
  };
  const trustState = getPhase1TrustState({
    owner_user_id: input.contract.owner_user_id ?? null,
    renewal_decision_status: input.contract.renewal_decision_status ?? "undecided",
    cycle_status: input.contract.cycle_status ?? "open",
    contract_metadata: {
      needs_review: metadata.needs_review,
      notice_deadline_date: metadata.notice_deadline_date,
      renewal_date: metadata.renewal_date,
      expiration_date: metadata.expiration_date,
      termination_window: metadata.termination_window,
      auto_renewal: metadata.auto_renewal,
      field_confidence: metadata.field_confidence,
      field_source_snippets: metadata.field_source_snippets,
      is_ocr_assisted: ocrAssisted
    }
  });
  const reviewMode = getPhase1ReviewMode(reviewMetadata);
  const dirtyReviewFlags = listPhase1ActiveReviewDirtyFlags(reviewMetadata);
  const reviewBlocked = Boolean(metadata.needs_review);
  const ownerBlocked = !input.contract.owner_user_id;
  const reminderActivationState = getReminderActivationState({
    needsReview: metadata.needs_review,
    ownerUserId: input.contract.owner_user_id ?? null,
    noticeDeadlineDate: metadata.notice_deadline_date,
    renewalDate: metadata.renewal_date,
    expirationDate: metadata.expiration_date,
    recipientCount: 1
  });
  const reminderBlockedReason = getContractDetailReminderBlockedReason(reminderActivationState);
  const nextReminder = getContractDetailNextReminder(
    (input.contract.reminders ?? []) as ContractDetailReminder[]
  );
  const approvalRows =
    (input.contract as { contract_trust_exception_approvals?: TrustExceptionApproval[] | null })
      .contract_trust_exception_approvals ?? [];
  const trustExceptionApproval =
    input.trustExceptionApproval === undefined
      ? [...approvalRows]
          .sort((left, right) => right.created_at.localeCompare(left.created_at))
          .find((approval) => isTrustExceptionApprovalActive(approval)) ?? null
      : isTrustExceptionApprovalActive(input.trustExceptionApproval)
        ? input.trustExceptionApproval
        : null;
  const trustExceptionApprovalState = deriveContractDetailTrustExceptionApprovalState({
    approvals: approvalRows,
    activeApproval: trustExceptionApproval,
    metadata
  });
  const approvedUnverifiedRiskOverride = Boolean(trustExceptionApproval);
  const evidenceConfidence = getContractDetailEvidenceConfidence(metadata);
  const p0FieldsReviewed = !reviewBlocked;
  const autoRenewReviewed = !reviewBlocked && metadata.auto_renewal !== null;
  const renewalDateReviewed = !reviewBlocked && Boolean(metadata.renewal_date);
  const noticeDeadlineReviewed = !reviewBlocked && Boolean(metadata.notice_deadline_date);
  const trustedReminderActive = reminderActivationState === "scheduled";
  const decisionRecorded = isContractDetailDecisionRecorded(input.contract.renewal_decision_status);
  const trustedReminderGate = evaluateTrustedReminderGate({
    contractId: input.contract.id,
    ownerUserId: input.contract.owner_user_id ?? null,
    renewalDate: metadata.renewal_date,
    noticeDeadline: metadata.notice_deadline_date,
    autoRenewReviewed,
    p0FieldsReviewed,
    evidenceConfidence,
    leadDays: TRUSTED_REMINDER_GATE_LEAD_DAYS,
    unverifiedRiskApprovalRequested: Boolean(metadata.accepted_unverified_risk_requested),
    trustExceptionApproval: trustExceptionApproval
      ? buildTrustExceptionApprovalGateEvidence(trustExceptionApproval)
      : null
  });
  const readinessScore = calculateRenewalReadiness({
    ownerAssigned: !ownerBlocked,
    renewalDateReviewed,
    noticeDeadlineReviewed,
    autoRenewReviewed,
    evidenceConfidence,
    approvedUnverifiedRiskOverride,
    trustedReminderActive,
    trustedReminderGateBlocked: !trustedReminderGate.canActivate,
    decisionRecorded,
    daysToNotice: getDaysUntilDate(metadata.notice_deadline_date)
  });
  const decisionLoop = deriveRenewalDecisionLoop({
    contractDetected: true,
    p0Reviewed: !reviewBlocked,
    ownerAssigned: !ownerBlocked,
    trustedReminderActive,
    decisionRecorded,
    cycleClosed: (input.contract.cycle_status ?? "open") === "closed"
  });
  const nextAction = deriveContractDetailNextAction({
    trustState,
    reviewBlocked,
    ownerBlocked,
    cycleStatus: input.contract.cycle_status,
    renewalDecisionStatus: input.contract.renewal_decision_status
  });
  const actorLabels = Object.fromEntries(
    input.members.map((member) => [
      member.user_id,
      member.user?.full_name ?? member.user?.notification_email ?? member.user_id
    ])
  );
  const duplicateCounterpartyIds = new Set(
    input.counterparties
      .filter((counterparty) => counterparty.duplicate_suggestions.length > 0)
      .map((counterparty) => counterparty.id)
  );
  const riskExplanation = buildRiskQueueRow({
    contractId: input.contract.id,
    contractTitle: metadata.contract_title ?? "Untitled contract",
    counterpartyName: metadata.counterparty_name ?? "Counterparty not set",
    department: input.contract.department?.trim() || "Unassigned department",
    ownerLabel,
    workflowTrustState: trustState,
    noticeDeadlineDate: metadata.notice_deadline_date,
    renewalDate: metadata.renewal_date,
    expirationDate: metadata.expiration_date,
    autoRenewalConfirmed: metadata.auto_renewal,
    contractValueAmount: metadata.contract_value_amount ?? null,
    decisionStatus: normalizeDecisionStatus(input.contract.renewal_decision_status),
    reminderAcknowledged: (input.contract.cycle_status ?? "open") !== "awaiting_acknowledgment",
    weakEvidence: Boolean(metadata.has_weak_evidence),
    reviewCompleted: !metadata.needs_review,
    acceptedRiskOverride: approvedUnverifiedRiskOverride,
    priceChangeTrigger: metadata.price_change_trigger ?? null,
    previousDeferWatchlist: input.contract.renewal_decision_status === "defer",
    reminderDeliveryFailures: (input.contract.reminders ?? []).filter((reminder) =>
      ["retry_pending", "failed_terminal"].includes(reminder.status ?? "")
    ).length,
    duplicateCounterpartyUncertainty: duplicateCounterpartyIds.has(
      input.contract.counterparty_id ?? ""
    )
  });
  const intelligenceAccess = await getIntelligenceSurfaceAccessMap({
    context: input.context,
    surfaces: ["risk_badge", "risk_explanation"],
    contractOwnerUserId: input.contract.owner_user_id
  });

  return {
    metadata,
    title: metadata.contract_title ?? "Untitled contract",
    counterpartyName: metadata.counterparty_name ?? "Counterparty not set",
    latestFileExtractionSource: latestFile?.extraction_source ?? null,
    ocrAssisted,
    ownerLabel,
    memberLabels: input.members.map((member) => ({
      user_id: member.user_id,
      label: member.user?.full_name ?? member.user?.notification_email ?? member.user_id
    })),
    actorLabels,
    trustState,
    reviewMode,
    dirtyReviewFlags,
    reviewBlocked,
    ownerBlocked,
    reviewMetadata,
    nextReminder,
    reminderActivationState,
    reminderBlockedReason,
    nextAction,
    workflowItems: buildContractDetailWorkflowItems({
      trustState,
      reviewBlocked,
      reviewMode,
      dirtyReviewFlags,
      ownerLabel,
      ownerBlocked,
      reminderBlockedReason,
      nextReminder,
      renewalDecisionStatus: input.contract.renewal_decision_status,
      cycleStatus: input.contract.cycle_status
    }),
    ownerReadiness: buildOwnerReminderReadiness({
      ownerLabel,
      ownerBlocked,
      reviewBlocked,
      reminderBlockedReason,
      nextReminder
    }),
    readinessScore,
    trustedReminderGate,
    trustExceptionApproval,
    trustExceptionApprovalState,
    decisionLoop,
    riskExplanation,
    intelligenceAccess
  } satisfies ContractDetailViewModel;
}

function buildContractDetailWorkflowItems(input: {
  trustState: string;
  reviewBlocked: boolean;
  reviewMode: string;
  dirtyReviewFlags: Array<{ key: string; label: string; impact: string }>;
  ownerLabel: string;
  ownerBlocked: boolean;
  reminderBlockedReason: ContractDetailViewModel["reminderBlockedReason"];
  nextReminder: ContractDetailReminder | null;
  renewalDecisionStatus: string | null | undefined;
  cycleStatus: string | null | undefined;
}) {
  return [
    {
      label: "Trust state",
      value: input.trustState,
      help:
        input.trustState === "Verified"
          ? "Reviewed truth is ready to drive reminders."
          : "Complete the blocked step before trusting automation."
    },
    {
      label: "Review",
      value: input.reviewBlocked
        ? input.reviewMode === "fast_review"
          ? "Fast review pending"
          : "Exception review pending"
        : "Review complete",
      help: input.reviewBlocked
        ? input.dirtyReviewFlags.length > 0
          ? `${input.dirtyReviewFlags.length} trust flag${input.dirtyReviewFlags.length === 1 ? "" : "s"} require exception review before trusted reminders activate.`
          : "Confirm the P0 fields before trusted reminders activate."
        : "The P0 record is confirmed and auditable."
    },
    {
      label: "Owner",
      value: input.ownerLabel,
      help: input.ownerBlocked
        ? "Assign one accountable owner to unblock trusted workflow."
        : "The owner is accountable for acknowledgment and decisions."
    },
    {
      label: "Due",
      value: input.reminderBlockedReason
        ? input.reminderBlockedReason === "blocked_by_review"
          ? "Blocked by review"
          : input.reminderBlockedReason === "blocked_by_missing_owner"
            ? "Blocked by missing owner"
            : "Blocked by missing P0"
        : input.nextReminder
          ? `${formatReminderTypeLabel(input.nextReminder.reminder_type)} | ${formatDate(input.nextReminder.remind_at)}`
          : "No reminder scheduled",
      help: input.nextReminder
        ? `Current reminder status: ${formatReminderRuntimeStatusLabel(input.nextReminder.status)}.`
        : input.reminderBlockedReason
          ? "Trusted reminders appear automatically once the blocked step is resolved."
          : "The trusted schedule will appear after review and owner assignment."
    },
    {
      label: "Decision",
      value: (input.renewalDecisionStatus ?? "undecided").replaceAll("_", " "),
      help: `Cycle state: ${(input.cycleStatus ?? "open").replaceAll("_", " ")}.`
    }
  ] satisfies ContractDetailWorkflowItem[];
}

function buildOwnerReminderReadiness(input: {
  ownerLabel: string;
  ownerBlocked: boolean;
  reviewBlocked: boolean;
  reminderBlockedReason: ContractDetailViewModel["reminderBlockedReason"];
  nextReminder: ContractDetailReminder | null;
}) {
  return {
    ownerStatus: input.ownerLabel,
    ownerHelp: input.ownerBlocked
      ? "Trusted reminders stay blocked until one accountable owner is assigned in review."
      : "The owner receives trusted reminders, records acknowledgment, and carries the decision forward.",
    reminderStatus: input.reminderBlockedReason
      ? input.reminderBlockedReason === "blocked_by_review"
        ? "Blocked by review"
        : input.reminderBlockedReason === "blocked_by_missing_owner"
          ? "Blocked by missing owner"
          : "Blocked by missing P0"
      : "Trusted schedule active",
    reminderHelp: input.reviewBlocked || input.ownerBlocked
      ? "The schedule stays inactive until reviewed P0 truth and owner assignment are both complete."
      : input.nextReminder
        ? `Next due event: ${formatReminderTypeLabel(input.nextReminder.reminder_type)} on ${formatDate(input.nextReminder.remind_at)}.`
        : "No reminder is due yet, but the contract is ready for the weekly loop."
  };
}

function normalizeDecisionStatus(value: string | null | undefined) {
  switch (value) {
    case "renew":
    case "terminate":
    case "renegotiate":
    case "defer":
    case "no_action_required":
      return value;
    default:
      return "undecided";
  }
}
