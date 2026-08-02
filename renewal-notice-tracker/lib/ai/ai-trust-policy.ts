import type { AiFactField, AiFactReviewStatus, AiFactTrustStatus, NormalizedAiFact } from "@/lib/ai/unified-ai-types";

export const AI_CRITICAL_RENEWAL_FIELDS: AiFactField[] = [
  "renewal_date",
  "expiration_date",
  "notice_deadline_date",
  "auto_renewal",
  "termination_window",
  "opt_out_deadline",
  "contract_value_amount",
  "contract_value_currency",
  "cancellation_window"
];

export function isCriticalAiRenewalFact(field: AiFactField) {
  return AI_CRITICAL_RENEWAL_FIELDS.includes(field);
}

export function determineAiFactTrustStatus(input: {
  field: AiFactField;
  confidence: number;
  evidenceReferencePresent: boolean;
  reviewStatus: AiFactReviewStatus;
}): AiFactTrustStatus {
  if (input.reviewStatus === "rejected") return "rejected";
  if (isCriticalAiRenewalFact(input.field) && input.reviewStatus !== "reviewed") return "needs_review";
  if (!input.evidenceReferencePresent || input.confidence < 0.75) return "needs_review";
  return input.reviewStatus === "reviewed" ? "accepted" : "proposed";
}

export function aiFactCanBecomeTrusted(fact: NormalizedAiFact) {
  return fact.reviewStatus === "reviewed" && fact.trustStatus === "accepted" && Boolean(fact.evidenceReference);
}
