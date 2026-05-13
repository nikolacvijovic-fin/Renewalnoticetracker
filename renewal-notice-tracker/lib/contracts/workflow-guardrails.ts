import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import {
  getPhase1QueueAssignments,
  getPhase1TrustState,
  getPrimaryOperationalDate,
  PHASE1_DUE_SOON_DAYS
} from "@/lib/contracts/phase1-pilot";
import { getReminderActivationState } from "@/lib/contracts/shipped-reminder-policy";

export const WORKFLOW_GUARDRAILS = {
  contractConfidenceThreshold: 0.8,
  fieldConfidenceThreshold: LOW_CONFIDENCE_THRESHOLD,
  dueSoonWindowDays: PHASE1_DUE_SOON_DAYS,
  staleNeedsReviewDays: 3,
  ownerInactivityDays: 21
} as const;

export function canGenerateTrustedReminders(input: {
  metadata: {
    renewal_date?: string | null;
    expiration_date?: string | null;
    notice_deadline_date?: string | null;
    needs_review?: boolean | null;
  };
  ownerUserId?: string | null;
}) {
  return (
    getReminderActivationState({
      needsReview: input.metadata.needs_review,
      ownerUserId: input.ownerUserId ?? null,
      noticeDeadlineDate: input.metadata.notice_deadline_date,
      renewalDate: input.metadata.renewal_date,
      expirationDate: input.metadata.expiration_date,
      recipientCount: 1
    }) === "scheduled"
  );
}

type ContractGuardrailRecord = {
  id: string;
  created_at: string;
  owner_user_id: string | null;
  renewal_decision_status?: string | null;
  cycle_status?: string | null;
  reminderHealth?: "healthy" | "delayed" | "retrying" | "failed" | "superseded" | null;
  contract_metadata?: {
    renewal_date?: string | null;
    expiration_date?: string | null;
    notice_deadline_date?: string | null;
    needs_review?: boolean | null;
    field_confidence?: Record<string, number> | null;
    field_source_snippets?: Record<string, string> | null;
  } | null;
};

function daysBetween(now: Date, isoDate: string) {
  const delta = new Date(isoDate).getTime() - now.getTime();
  return delta / (24 * 60 * 60 * 1000);
}

function isDueSoon(
  metadata: ContractGuardrailRecord["contract_metadata"],
  referenceDate: Date
) {
  const candidateDate = getPrimaryOperationalDate(metadata ?? {});
  if (!candidateDate) return false;
  const daysUntil = daysBetween(referenceDate, candidateDate);
  return daysUntil >= 0 && daysUntil <= WORKFLOW_GUARDRAILS.dueSoonWindowDays;
}

export function summarizeWorkflowGuardrails(
  contracts: ContractGuardrailRecord[],
  referenceDate = new Date()
) {
  let dueSoonNeedsReviewCount = 0;
  let dueSoonOwnerMissingCount = 0;
  let staleNeedsReviewCount = 0;
  let dueSoonQueueCount = 0;
  let decisionNeededCount = 0;
  let awaitingAcknowledgmentCount = 0;
  const trustStates: string[] = [];

  for (const contract of contracts) {
    const metadata = contract.contract_metadata ?? null;
    const needsReview = metadata?.needs_review === true;
    const createdAt = new Date(contract.created_at).getTime();
    const ageDays =
      Number.isNaN(createdAt) ? 0 : (referenceDate.getTime() - createdAt) / (24 * 60 * 60 * 1000);

    if (needsReview && ageDays >= WORKFLOW_GUARDRAILS.staleNeedsReviewDays) {
      staleNeedsReviewCount += 1;
    }

    const queues = getPhase1QueueAssignments(
      {
        owner_user_id: contract.owner_user_id,
        renewal_decision_status: contract.renewal_decision_status ?? "undecided",
        cycle_status: contract.cycle_status ?? "open",
        contract_metadata: metadata,
        reminderHealth: contract.reminderHealth ?? "healthy"
      },
      referenceDate
    );

    const trustState = getPhase1TrustState(
      {
        owner_user_id: contract.owner_user_id,
        renewal_decision_status: contract.renewal_decision_status ?? "undecided",
        cycle_status: contract.cycle_status ?? "open",
        contract_metadata: metadata,
        reminderHealth: contract.reminderHealth ?? "healthy"
      },
      referenceDate
    );

    trustStates.push(trustState);

    if (queues.includes("Due Soon")) {
      dueSoonQueueCount += 1;
    }
    if (queues.includes("Decision Needed")) {
      decisionNeededCount += 1;
    }
    if (queues.includes("Awaiting Acknowledgment")) {
      awaitingAcknowledgmentCount += 1;
    }

    if (!isDueSoon(metadata, referenceDate)) continue;

    if (needsReview) {
      dueSoonNeedsReviewCount += 1;
    }

    if (!contract.owner_user_id) {
      dueSoonOwnerMissingCount += 1;
    }
  }

  return {
    dueSoonNeedsReviewCount,
    dueSoonOwnerMissingCount,
    staleNeedsReviewCount,
    dueSoonQueueCount,
    decisionNeededCount,
    awaitingAcknowledgmentCount,
    trustStates
  };
}
