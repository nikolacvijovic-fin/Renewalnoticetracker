import {
  CONTRACT_PROCESSING_STATUSES,
  type ContractProcessingStatus
} from "@/lib/constants";
import {
  getReminderActivationState,
  type ReminderActivationState
} from "@/lib/contracts/shipped-reminder-policy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type DbClient = Pick<SupabaseClient<Database>, "from">;

export type ContractReviewStatus = "needs_review" | "reviewed";
type ContractLifecycleSnapshot = {
  needsReview?: boolean | null;
  ownerUserId?: string | null;
  noticeDeadlineDate?: string | null;
  renewalDate?: string | null;
  expirationDate?: string | null;
};
type ContractLifecycleRow = {
  status: string | null;
  owner_user_id: string | null;
  contract_metadata:
    | {
        needs_review?: boolean | null;
        notice_deadline_date?: string | null;
        renewal_date?: string | null;
        expiration_date?: string | null;
      }
    | Array<{
        needs_review?: boolean | null;
        notice_deadline_date?: string | null;
        renewal_date?: string | null;
        expiration_date?: string | null;
      }>
    | null;
};

const TRANSITIONS: Record<ContractProcessingStatus, ContractProcessingStatus[]> = {
  uploaded: ["queued_for_text_extraction", "needs_review", "archived"],
  queued_for_text_extraction: ["extracting_text", "text_extraction_failed", "archived"],
  extracting_text: ["text_extracted", "text_extraction_failed", "archived"],
  text_extracted: ["queued_for_field_extraction", "needs_review", "archived"],
  text_extraction_failed: ["queued_for_text_extraction", "archived"],
  queued_for_field_extraction: ["extracting_fields", "needs_review", "extraction_failed", "archived"],
  extracting_fields: ["needs_review", "extraction_failed", "archived"],
  extraction_failed: ["queued_for_field_extraction", "needs_review", "archived"],
  needs_review: ["reviewed", "archived"],
  reviewed: ["needs_review", "reminder_generation_pending", "archived"],
  reminder_generation_pending: ["reminders_scheduled", "reviewed", "needs_review", "archived"],
  reminders_scheduled: ["needs_review", "reviewed", "reminder_generation_pending", "archived"],
  archived: []
};

export function deriveContractReviewStatus(needsReview: boolean | null | undefined): ContractReviewStatus {
  return needsReview ? "needs_review" : "reviewed";
}

export function deriveContractReminderActivationState(
  snapshot: ContractLifecycleSnapshot
): ReminderActivationState {
  return getReminderActivationState({
    needsReview: snapshot.needsReview,
    ownerUserId: snapshot.ownerUserId ?? null,
    noticeDeadlineDate: snapshot.noticeDeadlineDate ?? null,
    renewalDate: snapshot.renewalDate ?? null,
    expirationDate: snapshot.expirationDate ?? null
  });
}

export function canEnterReminderGenerationState(snapshot: ContractLifecycleSnapshot) {
  return (
    deriveContractReviewStatus(snapshot.needsReview) === "reviewed" &&
    deriveContractReminderActivationState(snapshot) === "scheduled"
  );
}

function assertLifecycleAlignment(
  nextStatus: ContractProcessingStatus,
  snapshot: ContractLifecycleSnapshot
) {
  if (nextStatus === "reviewed" && deriveContractReviewStatus(snapshot.needsReview) !== "reviewed") {
    throw new Error("Reviewed processing status requires review completion.");
  }

  if (
    (nextStatus === "reminder_generation_pending" || nextStatus === "reminders_scheduled") &&
    !canEnterReminderGenerationState(snapshot)
  ) {
    const reminderActivationState = deriveContractReminderActivationState(snapshot);
    throw new Error(
      `Reminder generation requires reviewed P0, owner assignment, and confirmed P0 dates. Current activation state: ${reminderActivationState}.`
    );
  }
}

export function isContractProcessingStatus(value: string): value is ContractProcessingStatus {
  return (CONTRACT_PROCESSING_STATUSES as readonly string[]).includes(value);
}

export function canTransitionContractStatus(
  current: ContractProcessingStatus,
  next: ContractProcessingStatus
) {
  return current === next || TRANSITIONS[current].includes(next);
}

export async function transitionContractStatus(
  client: DbClient,
  contractId: string,
  organizationId: string,
  nextStatus: ContractProcessingStatus
) {
  const contractsQuery = client.from("contracts");
  const { data: contract, error: readError } = await contractsQuery
    .select(
      "status, owner_user_id, contract_metadata(needs_review, notice_deadline_date, renewal_date, expiration_date)"
    )
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .single();

  if (readError) throw readError;

  const typedContract = contract as ContractLifecycleRow;
  const current: ContractProcessingStatus = isContractProcessingStatus(typedContract.status ?? "")
    ? (typedContract.status as ContractProcessingStatus)
    : "uploaded";
  const metadata = Array.isArray(typedContract.contract_metadata)
    ? typedContract.contract_metadata[0]
    : typedContract.contract_metadata;
  const snapshot: ContractLifecycleSnapshot = {
    needsReview: metadata?.needs_review ?? null,
    ownerUserId: typedContract.owner_user_id ?? null,
    noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
    renewalDate: metadata?.renewal_date ?? null,
    expirationDate: metadata?.expiration_date ?? null
  };

  if (!canTransitionContractStatus(current, nextStatus)) {
    throw new Error(`Invalid contract status transition from ${current} to ${nextStatus}.`);
  }

  assertLifecycleAlignment(nextStatus, snapshot);

  const { error: updateError } = await client
    .from("contracts")
    .update({ status: nextStatus })
    .eq("id", contractId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;
}

export function initialManualContractStatus(needsReview: boolean): ContractProcessingStatus {
  return deriveContractReviewStatus(needsReview);
}

export function nextReviewedContractStatus(needsReview: boolean): ContractProcessingStatus {
  return deriveContractReviewStatus(needsReview);
}
