import { addDays } from "date-fns";
import type { z } from "zod";
import { reminderSchema } from "@/lib/validation/reminder";

type Reminder = z.infer<typeof reminderSchema>;

export function buildEscalationReminders(
  baseReminder: Reminder,
  escalationRecipients: string[],
  escalationDelayDays: number
) {
  if (escalationRecipients.length === 0) return [];

  const escalatedAt = addDays(new Date(baseReminder.remind_at), escalationDelayDays).toISOString();
  return [
    reminderSchema.parse({
      ...baseReminder,
      recipient_email: escalationRecipients[0] ?? baseReminder.recipient_email,
      recipient_emails: escalationRecipients,
      remind_at: escalatedAt,
      escalation_level: (baseReminder.escalation_level ?? 0) + 1
    })
  ];
}
