"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { getContractById, requireScopedContract } from "@/lib/contracts/kernel-queries";
import {
  createRenewalQuoteComparison,
  createSavingsOpportunityFromFinding,
  getRenewalQuoteComparison,
  reviewQuoteFinding,
  updateSavingsOpportunityStatus
} from "@/lib/quote-comparison/quote-comparison";
import { runPythonRenewalQuoteComparison } from "@/lib/quote-comparison/python-quote-comparison-runner";

function contractPath(contractId: string) {
  return `/dashboard/contracts/${contractId}`;
}

function firstMetadata<T>(metadata: T | T[] | null | undefined): T | null {
  return Array.isArray(metadata) ? metadata[0] ?? null : metadata ?? null;
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formNumber(formData: FormData, key: string) {
  const value = formString(formData, key);
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function termsFromContract(contract: Awaited<ReturnType<typeof getContractById>>) {
  const metadata = firstMetadata(contract.contract_metadata);
  return {
    total_amount: metadata?.contract_value_amount ?? null,
    currency: metadata?.contract_value_currency ?? null,
    payment_terms: metadata?.payment_terms ?? null,
    renewal_term: metadata?.renewal_term ?? null,
    auto_renewal: metadata?.auto_renewal ?? null,
    notice_deadline_date: metadata?.notice_deadline_date ?? null,
    price_change_trigger: metadata?.price_change_trigger ?? null
  };
}

function proposedTermsFromForm(formData: FormData) {
  return {
    total_amount: formNumber(formData, "proposed_total_amount"),
    currency: formString(formData, "currency"),
    payment_terms: formString(formData, "payment_terms"),
    renewal_term: formString(formData, "renewal_term"),
    discounts: formString(formData, "discounts")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    skus: formString(formData, "skus")
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

export async function createQuoteComparisonAction(contractId: string, quoteFileId?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  await requireScopedContract(contractId, context.organizationId);

  const comparison = await createRenewalQuoteComparison({
    organizationId: context.organizationId,
    contractId,
    quoteFileId: quoteFileId ?? null,
    requestedByUserId: context.user.id,
    source: quoteFileId ? "file_upload" : "manual"
  });

  revalidatePath(contractPath(contractId));
  return comparison;
}

export async function runQuoteComparisonAction(
  comparisonId: string,
  options?: {
    proposedTerms?: Record<string, unknown>;
    quoteText?: string | null;
  }
) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  const comparison = await getRenewalQuoteComparison({
    organizationId: context.organizationId,
    comparisonId
  });
  const contract = await getContractById(comparison.contract_id, context.organizationId);
  await requireScopedContract(contract.id, context.organizationId);

  const result = await runPythonRenewalQuoteComparison({
    organizationId: context.organizationId,
    contractId: contract.id,
    quoteFileId: comparison.quote_file_id,
    requestedByUserId: context.user.id,
    currentTerms: termsFromContract(contract),
    proposedTerms: options?.proposedTerms ?? {},
    quoteText: options?.quoteText ?? null
  });

  revalidatePath(contractPath(contract.id));
  return result;
}

export async function createAndRunQuoteComparisonFormAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  const contract = await getContractById(contractId, context.organizationId);
  await requireScopedContract(contract.id, context.organizationId);

  await runPythonRenewalQuoteComparison({
    organizationId: context.organizationId,
    contractId,
    requestedByUserId: context.user.id,
    currentTerms: termsFromContract(contract),
    proposedTerms: proposedTermsFromForm(formData),
    quoteText: formString(formData, "quote_text")
  });

  revalidatePath(contractPath(contractId));
}

export async function reviewQuoteFindingAction(
  findingId: string,
  decision: "reviewed" | "dismissed" | "accepted"
) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  const finding = await reviewQuoteFinding({
    organizationId: context.organizationId,
    findingId,
    reviewerUserId: context.user.id,
    decision
  });

  revalidatePath(contractPath(finding.contract_id));
  return finding;
}

export async function reviewQuoteFindingFormAction(
  findingId: string,
  decision: "reviewed" | "dismissed" | "accepted"
) {
  await reviewQuoteFindingAction(findingId, decision);
}

export async function createSavingsOpportunityAction(findingId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  const opportunity = await createSavingsOpportunityFromFinding({
    organizationId: context.organizationId,
    findingId,
    actorUserId: context.user.id
  });

  revalidatePath(contractPath(opportunity.contract_id));
  return opportunity;
}

export async function createSavingsOpportunityFormAction(findingId: string) {
  await createSavingsOpportunityAction(findingId);
}

export async function dismissSavingsOpportunityAction(opportunityId: string, reason?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  const opportunity = await updateSavingsOpportunityStatus({
    organizationId: context.organizationId,
    opportunityId,
    actorUserId: context.user.id,
    status: "dismissed",
    reason
  });

  revalidatePath(contractPath(opportunity.contract_id));
  return opportunity;
}

export async function dismissSavingsOpportunityFormAction(opportunityId: string, formData: FormData) {
  await dismissSavingsOpportunityAction(opportunityId, formString(formData, "reason"));
}
