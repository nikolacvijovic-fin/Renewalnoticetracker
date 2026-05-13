import { z } from "zod";

export const authEmailSchema = z.object({
  email: z.string().email()
});

export const passwordResetSchema = z.object({
  email: z.string().email()
});

export const updatePasswordSchema = z.object({
  password: z.string().min(10, "Use at least 10 characters for the new password.")
});
