import { z } from "zod";
import { SHIPPED_REMINDER_TYPES } from "@/lib/contracts/shipped-reminder-policy";

export const reminderSchema = z.object({
  reminder_type: z.enum(SHIPPED_REMINDER_TYPES),
  remind_at: z.string().min(1),
  recipient_email: z.string().email(),
  recipient_emails: z.array(z.string().email()).min(1),
  rule_name: z.literal(null).nullable().optional(),
  escalation_level: z.number().int().min(0).default(0),
  delivery_key: z.string().nullable().optional(),
  ical_uid: z.string().nullable().optional(),
  source: z.enum(["system", "manual"]).default("manual")
});
