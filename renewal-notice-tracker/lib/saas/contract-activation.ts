import type { Json } from "@/lib/supabase/database.types";

export type SaasContractActivationBlocker =
  | "metadata_needs_review"
  | "missing_verified_notice_deadline"
  | "missing_auto_renewal_review"
  | "missing_title_or_vendor"
  | "missing_owner"
  | "incomplete_financial_value";

export type SaasContractActivationReadiness = {
  allowed: boolean;
  blockers: SaasContractActivationBlocker[];
  nextAction: string;
};

export type SaasContractActivationResult = {
  contractId: string;
  softwareId: string;
  saasTermId: string;
  optOutWindowId: string;
  optOutDeadline: string;
  replayed: boolean;
};

export function evaluateSaasContractActivationReadiness(input: {
  needsReview: boolean;
  reviewedAt: string | null;
  reviewedBy: string | null;
  noticeDeadlineDate: string | null;
  deadlineVerifiedAt: string | null;
  autoRenewal: boolean | null;
  contractTitle: string | null;
  counterpartyName: string | null;
  ownerUserId: string | null;
  contractValueAmount: number | null;
  contractValueCurrency: string | null;
}): SaasContractActivationReadiness {
  const blockers: SaasContractActivationBlocker[] = [];
  if (input.needsReview || !input.reviewedAt || !input.reviewedBy) {
    blockers.push("metadata_needs_review");
  }
  if (!input.noticeDeadlineDate || !input.deadlineVerifiedAt) {
    blockers.push("missing_verified_notice_deadline");
  }
  if (input.autoRenewal === null) blockers.push("missing_auto_renewal_review");
  if (!input.contractTitle?.trim() || !input.counterpartyName?.trim()) {
    blockers.push("missing_title_or_vendor");
  }
  if (!input.ownerUserId) blockers.push("missing_owner");
  if ((input.contractValueAmount === null) !== (input.contractValueCurrency === null)) {
    blockers.push("incomplete_financial_value");
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    nextAction: blockers.length === 0
      ? "Activate the reviewed contract for the Opt-Out Clock."
      : "Complete the blocked review fields before activating the Opt-Out Clock."
  };
}

function objectFromJson(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parseSaasContractActivationResult(value: Json | null): SaasContractActivationResult {
  const object = objectFromJson(value);
  const required = [
    "contractId",
    "softwareId",
    "saasTermId",
    "optOutWindowId",
    "optOutDeadline"
  ] as const;
  if (required.some((key) => typeof object[key] !== "string" || !object[key])) {
    throw new Error("SaaS Opt-Out Clock activation returned an incomplete result.");
  }

  return {
    contractId: object.contractId as string,
    softwareId: object.softwareId as string,
    saasTermId: object.saasTermId as string,
    optOutWindowId: object.optOutWindowId as string,
    optOutDeadline: object.optOutDeadline as string,
    replayed: object.replayed === true
  };
}

export const SAAS_ACTIVATION_BLOCKER_LABELS: Record<SaasContractActivationBlocker, string> = {
  metadata_needs_review: "Finish human review",
  missing_verified_notice_deadline: "Confirm the notice deadline",
  missing_auto_renewal_review: "Confirm the auto-renewal setting",
  missing_title_or_vendor: "Add the contract title and vendor",
  missing_owner: "Assign an organization owner",
  incomplete_financial_value: "Review contract amount and currency together"
};
