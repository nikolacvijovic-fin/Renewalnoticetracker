import type { ExtractedContractFields } from "@/lib/validation/contract";
import { buildShippedReminderSchedule } from "@/lib/contracts/shipped-reminder-policy";

type ExtendedReminderMetadata = ExtractedContractFields & {
  owner_user_id?: string | null;
};

export function generateReminderRecommendations(
  metadata: ExtendedReminderMetadata,
  recipientEmails: string[]
) {
  return buildShippedReminderSchedule(metadata, recipientEmails);
}
