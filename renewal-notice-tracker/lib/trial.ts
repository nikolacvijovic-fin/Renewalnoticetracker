import { COMMERCIAL_POLICY } from "@/lib/billing/policy";

const TRIAL_DURATION_DAYS = COMMERCIAL_POLICY.trialDurationDays;

export function getTrialWindow(startAt = new Date()) {
  const trialStartedAt = new Date(startAt);
  const trialEndsAt = new Date(startAt);
  trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DURATION_DAYS);

  return {
    trialStartedAt: trialStartedAt.toISOString(),
    trialEndsAt: trialEndsAt.toISOString()
  };
}

export function normalizeAttributionValue(value: FormDataEntryValue | string | null | undefined) {
  const normalized = String(value ?? "").trim().slice(0, 120);
  return normalized.length > 0 ? normalized : null;
}
