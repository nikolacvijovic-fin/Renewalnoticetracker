import { z } from "zod";

export const resendNotificationSchema = z.object({
  notification_log_id: z.string().uuid(),
  organization_id: z.string().uuid()
});

export const rerunReminderSchema = z.object({
  reminder_id: z.string().uuid(),
  organization_id: z.string().uuid()
});
