import { z } from "zod";

export const profileSettingsSchema = z.object({
  full_name: z.string().min(2),
  notification_email: z.string().email(),
  organization_name: z.string().min(2),
  billing_email: z.string().email()
});
