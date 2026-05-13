import { addMinutes } from "date-fns";
import { REMINDER_RETRY_POLICY } from "@/lib/constants";

export function nextRetryForAttempt(attemptNumber: number) {
  return addMinutes(new Date(), REMINDER_RETRY_POLICY.baseDelayMinutes * attemptNumber).toISOString();
}

export function isTerminalAttempt(attemptNumber: number, maxAttempts: number) {
  return attemptNumber >= maxAttempts;
}

export function buildDeliveryKey(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(":");
}
