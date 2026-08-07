import type { ExtractedContractFields } from "@/lib/validation/contract";
import { buildShippedReminderSchedule } from "@/lib/contracts/shipped-reminder-policy";

type ExtendedReminderMetadata = ExtractedContractFields & {
  owner_user_id?: string | null;
};

export function generateReminderRecommendations(
  metadata: ExtendedReminderMetadata,
  recipientEmails: string[],
  options?: {
    organizationId?: string | null;
    contractId?: string | null;
    contractStatus?: string | null;
    cycleStatus?: string | null;
    renewalDecisionStatus?: string | null;
  }
) {
  return buildShippedReminderSchedule(metadata, recipientEmails, options);
}
