import { addDays, isWeekend, subDays } from "date-fns";
import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";

export const PHASE1_P0_FIELDS = [
  "notice_deadline_date",
  "renewal_date",
  "expiration_date",
  "termination_window",
  "auto_renewal"
] as const;

export type Phase1P0Field = (typeof PHASE1_P0_FIELDS)[number];

export const PHASE1_REVIEW_MODES = ["fast_review", "exception_review"] as const;
export type Phase1ReviewMode = (typeof PHASE1_REVIEW_MODES)[number];
export const PHASE1_REVIEW_DIRTY_FLAGS = [
  "has_conflict",
  "has_derived_date",
  "has_weak_evidence",
  "is_ocr_assisted",
  "is_manual_without_evidence",
  "changes_previously_verified_p0",
  "accepted_unverified_risk_requested"
] as const;
export type Phase1ReviewDirtyFlag = (typeof PHASE1_REVIEW_DIRTY_FLAGS)[number];
export type Phase1ReviewDirtyFlags = Record<Phase1ReviewDirtyFlag, boolean>;

export const PHASE1_TRUST_STATES = [
  "Verified",
  "Needs Review",
  "Owner Missing",
  "Awaiting Acknowledgment",
  "Decision Needed",
  "Unverified Risk Accepted",
  "Conflict Requires Review",
  "Reminder Delivery Issue",
  "Overdue Action",
  "Due Soon",
  "Superseded by New Version"
] as const;

export type Phase1TrustState = (typeof PHASE1_TRUST_STATES)[number];

export const PHASE1_OPERATOR_QUEUES = [
  "Needs Review",
  "Owner Missing",
  "Due Soon",
  "Decision Needed",
  "Awaiting Acknowledgment"
] as const;

export type Phase1OperatorQueue = (typeof PHASE1_OPERATOR_QUEUES)[number];

export const PHASE1_REMINDER_DAY_OFFSETS = {
  notice_deadline: [90, 60, 30, 14, 7],
  renewal_date: [90, 60, 30, 14],
  expiration_date: [90, 60, 30, 14]
} as const;

export const PHASE1_DECISION_REQUEST_NOTICE_DAYS = 60;
export const PHASE1_DECISION_REQUEST_FALLBACK_DAYS = 90;
export const PHASE1_ACKNOWLEDGMENT_BUSINESS_DAYS = 3;
export const PHASE1_DUE_SOON_DAYS = 14;

type ReviewMetadata = {
  needs_review?: boolean | null;
  ocr_assisted?: boolean | null;
  is_ocr_assisted?: boolean | null;
  reviewer_notes?: string | null;
  field_confidence?: Record<string, number> | null;
  field_source_snippets?: Record<string, string> | null;
  notice_deadline_date?: string | null;
  renewal_date?: string | null;
  expiration_date?: string | null;
  termination_window?: string | null;
  auto_renewal?: boolean | null;
  has_conflict?: boolean | null;
  has_derived_date?: boolean | null;
  has_weak_evidence?: boolean | null;
  is_manual_without_evidence?: boolean | null;
  changes_previously_verified_p0?: boolean | null;
  accepted_unverified_risk_requested?: boolean | null;
};

type QueueRecord = {
  owner_user_id?: string | null;
  renewal_decision_status?: string | null;
  cycle_status?: string | null;
  contract_metadata?: ReviewMetadata | null;
  reminderHealth?: "healthy" | "delayed" | "retrying" | "failed" | "superseded" | null;
};

function hasWeakEvidence(metadata: ReviewMetadata) {
  return PHASE1_P0_FIELDS.some((field) => {
    const confidence = metadata.field_confidence?.[field] ?? 0;
    const snippet = metadata.field_source_snippets?.[field];
    const hasValue =
      field === "auto_renewal"
        ? metadata.auto_renewal !== null && metadata.auto_renewal !== undefined
        : Boolean(metadata[field]);

    return hasValue && (confidence < LOW_CONFIDENCE_THRESHOLD || !snippet?.trim());
  });
}

export function getPhase1ReviewDirtyFlags(metadata: ReviewMetadata): Phase1ReviewDirtyFlags {
  return {
    has_conflict: metadata.has_conflict === true,
    has_derived_date: metadata.has_derived_date === true,
    has_weak_evidence: metadata.has_weak_evidence === true || hasWeakEvidence(metadata),
    is_ocr_assisted: metadata.is_ocr_assisted === true || metadata.ocr_assisted === true,
    is_manual_without_evidence: metadata.is_manual_without_evidence === true,
    changes_previously_verified_p0: metadata.changes_previously_verified_p0 === true,
    accepted_unverified_risk_requested: metadata.accepted_unverified_risk_requested === true
  };
}

export function listPhase1ActiveReviewDirtyFlags(metadata: ReviewMetadata) {
  const dirtyFlags = getPhase1ReviewDirtyFlags(metadata);
  const dirtyFlagDetails: Record<Phase1ReviewDirtyFlag, { label: string; impact: string }> = {
    has_conflict: {
      label: "Conflict detected",
      impact: "Reminder-driving truth is conflicting and must be justified before trust can increase."
    },
    has_derived_date: {
      label: "Derived date detected",
      impact: "At least one P0 date is inferred rather than directly evidenced, so review must stay auditable."
    },
    has_weak_evidence: {
      label: "Weak evidence",
      impact: "Low confidence or missing source snippets block fast-path trust."
    },
    is_ocr_assisted: {
      label: "OCR-assisted extraction",
      impact: "OCR-derived truth stays exception-reviewed until a human confirms it."
    },
    is_manual_without_evidence: {
      label: "Manual entry without evidence",
      impact: "Operator-entered values without evidence need explicit justification before reminders can be trusted."
    },
    changes_previously_verified_p0: {
      label: "Previously verified P0 changed",
      impact: "Changing reviewed truth supersedes prior reminders and requires a new audit trail."
    },
    accepted_unverified_risk_requested: {
      label: "Unverified risk accepted",
      impact: "Proceeding despite unresolved trust issues requires an explicit exception reason."
    }
  };

  return PHASE1_REVIEW_DIRTY_FLAGS.filter((flag) => dirtyFlags[flag]).map((flag) => ({
    key: flag,
    ...dirtyFlagDetails[flag]
  }));
}

export function getPhase1ReviewMode(metadata: ReviewMetadata): Phase1ReviewMode {
  const dirtyFlags = getPhase1ReviewDirtyFlags(metadata);

  if (Object.values(dirtyFlags).some(Boolean)) {
    return "exception_review";
  }

  return "fast_review";
}

export function requiresReviewReason(input: {
  reviewMode: Phase1ReviewMode;
  needsReview: boolean;
  reviewReason?: string | null;
}) {
  if (input.needsReview) {
    return Boolean(input.reviewReason?.trim());
  }

  if (input.reviewMode === "exception_review") {
    return Boolean(input.reviewReason?.trim());
  }

  return true;
}

type PreviouslyVerifiedReviewMetadata = Pick<
  ReviewMetadata,
  | "needs_review"
  | "notice_deadline_date"
  | "renewal_date"
  | "expiration_date"
  | "termination_window"
  | "auto_renewal"
>;

export function hasPreviouslyVerifiedP0Changes(
  previous: PreviouslyVerifiedReviewMetadata | null | undefined,
  next: Pick<
    ReviewMetadata,
    "notice_deadline_date" | "renewal_date" | "expiration_date" | "termination_window" | "auto_renewal"
  >
) {
  if (!previous || previous.needs_review !== false) {
    return false;
  }

  return PHASE1_P0_FIELDS.some((field) => {
    const previousValue = previous[field];
    const nextValue = next[field];
    return previousValue !== nextValue;
  });
}

export function getPrimaryOperationalDate(metadata: ReviewMetadata) {
  return metadata.notice_deadline_date ?? metadata.renewal_date ?? metadata.expiration_date ?? null;
}

export function deriveCycleStatusFromDecision(
  decisionStatus: string | null | undefined,
  currentCycleStatus: string | null | undefined
) {
  const normalizedDecision = decisionStatus ?? "undecided";
  const normalizedCycle = currentCycleStatus ?? "open";

  if (normalizedDecision === "undecided") {
    return normalizedCycle === "awaiting_acknowledgment" ? "awaiting_acknowledgment" : "awaiting_decision";
  }

  if (normalizedDecision === "defer") {
    return "parked";
  }

  return "closed";
}

export function moveToPreviousBusinessDay(date: Date) {
  let cursor = new Date(date);
  while (isWeekend(cursor)) {
    cursor = subDays(cursor, 1);
  }
  return cursor;
}

export function addBusinessDays(date: Date, days: number) {
  let cursor = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (!isWeekend(cursor)) {
      remaining -= 1;
    }
  }
  return cursor;
}

export function getPhase1TrustState(
  row: QueueRecord,
  referenceDate = new Date()
): Phase1TrustState {
  const metadata = row.contract_metadata ?? null;
  const primaryDate = getPrimaryOperationalDate(metadata ?? {});
  const dueSoon = isDueSoonDate(primaryDate, referenceDate);
  const overdue = isOverdueDate(primaryDate, referenceDate);

  if (row.cycle_status === "superseded") return "Superseded by New Version";
  if (row.reminderHealth === "failed") return "Reminder Delivery Issue";
  if (metadata?.needs_review) {
    return getPhase1ReviewMode(metadata) === "exception_review"
      ? "Conflict Requires Review"
      : "Needs Review";
  }
  if (!row.owner_user_id) return "Owner Missing";
  if (row.cycle_status === "awaiting_acknowledgment") return "Awaiting Acknowledgment";
  if (row.cycle_status === "awaiting_decision" && (row.renewal_decision_status ?? "undecided") === "undecided") {
    return "Decision Needed";
  }
  if (overdue) return "Overdue Action";
  if ((row.renewal_decision_status ?? "undecided") === "undecided" && dueSoon) return "Decision Needed";
  if (dueSoon) return "Due Soon";
  return "Verified";
}

export function getPhase1QueueAssignments(
  row: QueueRecord,
  referenceDate = new Date()
): Phase1OperatorQueue[] {
  const trustState = getPhase1TrustState(row, referenceDate);
  const queues: Phase1OperatorQueue[] = [];

  if (trustState === "Needs Review" || trustState === "Conflict Requires Review") {
    queues.push("Needs Review");
  }
  if (trustState === "Owner Missing") {
    queues.push("Owner Missing");
  }
  if (
    trustState === "Due Soon" ||
    trustState === "Overdue Action" ||
    trustState === "Reminder Delivery Issue" ||
    trustState === "Decision Needed"
  ) {
    queues.push("Due Soon");
  }
  if (trustState === "Decision Needed") {
    queues.push("Decision Needed");
  }
  if (trustState === "Awaiting Acknowledgment") {
    queues.push("Awaiting Acknowledgment");
  }

  return queues;
}

export function isDueSoonDate(isoDate: string | null | undefined, referenceDate = new Date()) {
  if (!isoDate) return false;
  const candidate = new Date(isoDate);
  if (Number.isNaN(candidate.getTime())) return false;
  const delta = (candidate.getTime() - referenceDate.getTime()) / (24 * 60 * 60 * 1000);
  return delta >= 0 && delta <= PHASE1_DUE_SOON_DAYS;
}

export function isOverdueDate(isoDate: string | null | undefined, referenceDate = new Date()) {
  if (!isoDate) return false;
  const candidate = new Date(isoDate);
  if (Number.isNaN(candidate.getTime())) return false;
  return candidate.getTime() < referenceDate.getTime();
}
