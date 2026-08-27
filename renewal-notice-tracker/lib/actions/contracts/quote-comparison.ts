"use server";

import { randomUUID } from "node:crypto";
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
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";
import { enforceDesignPartnerBetaMutation } from "@/lib/billing/design-partner-beta";
import { listContractDocumentRelationships, listContractExtractedFields } from "@/lib/contract-intelligence/extraction-runs";
import { buildCommercialBaselineFromReviewedEvidence } from "@/lib/quote-comparison/commercial-baseline";
import { createImmutableCommercialBaseline } from "@/lib/quote-comparison/commercial-baseline-service";
import { runPersistedCommercialComparison } from "@/lib/quote-comparison/persisted-commercial-comparison";
import { MAX_CONTRACT_FILE_BYTES } from "@/lib/contract-intelligence/document-parser";
import { extractFullCommercialDocument } from "@/lib/contract-intelligence/full-document-extractor";
import { OpenAiCommercialExtractionProvider } from "@/lib/contract-intelligence/openai-commercial-extractor";
import {
  COMMERCIAL_PROPOSAL_MIME_TYPES,
  parseCommercialProposalSpreadsheet,
  proposalTermsFromCommercialCandidates
} from "@/lib/quote-comparison/proposal-ingestion";
import {
  failAdminRenewalProposalUpload,
  getAdminReadyCommercialProposal,
  getLatestAdminCommercialBaseline,
  markAdminRenewalProposalUploadReady,
  uploadAdminRenewalProposalFile
} from "@/lib/quote-comparison/repositories/admin-quote-comparison-repository";
import { prepareCommercialProposalDocument } from "@/lib/quote-comparison/proposal-document-preparation";
import type { CommercialTermsInput } from "@/lib/quote-comparison/commercial-comparison-engine";

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

export async function createQuoteComparisonAction(contractId: string, quoteFileId?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "upload_renewal_proposal");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "upload_quote" });
  const contract = await getContractById(contractId, context.organizationId);
  await requireScopedContract(contractId, context.organizationId);
  if (quoteFileId) {
    const quoteFile = contract.contract_files?.find((file) => file.id === quoteFileId);
    if (!quoteFile) {
      throw new Error("Proposal file was not found for this contract and organization.");
    }
    if (quoteFile.extraction_source === "commercial_proposal" && quoteFile.proposal_upload_status !== "ready") {
      throw new Error("Commercial proposal evidence is not ready for use.");
    }
  }

  const comparison = await createRenewalQuoteComparison({
    organizationId: context.organizationId,
    contractId,
    quoteFileId: quoteFileId ?? null,
    requestedByUserId: context.user.id,
    source: quoteFileId ? "file_upload" : "manual"
  });

  await recalculateEvidenceReadiness({
    organizationId: context.organizationId,
    contractId,
    actorUserId: context.user.id,
    trigger: "quote_uploaded"
  }).catch(() => null);

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
  await assertCanUseShippedAction(context, "run_commercial_comparison");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "review_quote" });
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

  await recalculateEvidenceReadiness({
    organizationId: context.organizationId,
    contractId: contract.id,
    actorUserId: context.user.id,
    trigger: "quote_comparison_completed"
  }).catch(() => null);

  revalidatePath(contractPath(contract.id));
  return result;
}

export async function createAndRunQuoteComparisonFormAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "upload_renewal_proposal");
  await assertCanUseShippedAction(context, "run_commercial_comparison");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "upload_quote" });
  const contract = await getContractById(contractId, context.organizationId);
  await requireScopedContract(contract.id, context.organizationId);

  const evidenceId = randomUUID();
  const currency = formString(formData, "currency")?.toUpperCase() ?? "";
  const totalAmount = formNumber(formData, "proposed_total_amount");
  await runPersistedCommercialComparison({
    organizationId: context.organizationId,
    contractId,
    actorUserId: context.user.id,
    proposalDocumentType: "pricing_proposal",
    proposalTerms: {
      lineItems: [{
        lineKey: formString(formData, "sku") ?? "proposal-total",
        productName: formString(formData, "product_name") ?? "Renewal proposal",
        sku: formString(formData, "sku"),
        chargeType: formString(formData, "charge_type") === "one_time" ? "one_time" : "recurring",
        pricingModel: formNumber(formData, "quantity") != null && formNumber(formData, "unit_price") != null ? "per_unit" : "flat",
        billingPeriod: (formString(formData, "billing_period") as "monthly" | "quarterly" | "annual" | "multi_year" | "partial" | null) ?? "annual",
        quantity: formNumber(formData, "quantity"),
        unitPrice: formNumber(formData, "unit_price"),
        totalAmount,
        currency,
        termMonths: formNumber(formData, "term_months"),
        discountAmount: formNumber(formData, "discount_amount"),
        discountPercent: formNumber(formData, "discount_percent"),
        evidence: [{
          evidenceId,
          sourceFileId: "manual-proposal-entry",
          extractionRunId: "manual-proposal-entry",
          state: "proposed",
          label: "User-entered proposal evidence"
        }]
      }],
      currency,
      paymentTerms: formString(formData, "payment_terms"),
      renewalTermMonths: formNumber(formData, "term_months"),
      evidence: [{
        evidenceId,
        sourceFileId: "manual-proposal-entry",
        extractionRunId: "manual-proposal-entry",
        state: "proposed",
        label: "User-entered proposal evidence"
      }]
    }
  });

  await recalculateEvidenceReadiness({
    organizationId: context.organizationId,
    contractId,
    actorUserId: context.user.id,
    trigger: "quote_uploaded"
  }).catch(() => null);

  revalidatePath(contractPath(contractId));
}

export async function createReviewedCommercialBaselineAction(contractId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_renewal_evidence");
  await requireScopedContract(contractId, context.organizationId);
  const [fields, relationships] = await Promise.all([
    listContractExtractedFields({ organizationId: context.organizationId, contractId, evidenceStatus: "accepted" }),
    listContractDocumentRelationships({ organizationId: context.organizationId, contractId })
  ]);
  const draft = buildCommercialBaselineFromReviewedEvidence({
    contractId,
    reviewerUserId: context.user.id,
    fields,
    relationships
  });
  const baseline = await createImmutableCommercialBaseline({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    draft
  });
  revalidatePath(contractPath(contractId));
  return baseline;
}

export async function createReviewedCommercialBaselineFormAction(contractId: string) {
  await createReviewedCommercialBaselineAction(contractId);
}

export async function uploadAndRunCommercialProposalFormAction(contractId: string, formData: FormData) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "upload_renewal_proposal");
  await assertCanUseShippedAction(context, "run_commercial_comparison");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "upload_quote" });
  await requireScopedContract(contractId, context.organizationId);
  const baseline = await getLatestAdminCommercialBaseline({ organizationId: context.organizationId, contractId });
  if (baseline.error) throw baseline.error;
  if (!baseline.data) throw new Error("Create a reviewed commercial baseline before uploading a proposal.");

  const file = formData.get("proposal_file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Select a proposal PDF, DOCX, or XLSX file.");
  if (!(COMMERCIAL_PROPOSAL_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new Error("Only proposal PDF, DOCX, and XLSX files are supported.");
  }
  if (file.size > MAX_CONTRACT_FILE_BYTES) throw new Error("The proposal file exceeds the 15 MiB limit.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await uploadAdminRenewalProposalFile({
    organizationId: context.organizationId,
    contractId,
    actorUserId: context.user.id,
    fileName: file.name,
    mimeType: file.type,
    buffer
  });
  if (stored.error || !stored.data) throw new Error("The proposal file could not be stored safely.");

  if (stored.data.proposal_upload_status === "ready") {
    const existing = await getAdminReadyCommercialProposal({
      organizationId: context.organizationId,
      contractId,
      quoteFileId: stored.data.id
    });
    if (existing.error || !existing.data) {
      throw new Error("The completed proposal evidence could not be loaded safely.");
    }
    const replay = await runPersistedCommercialComparison({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      proposalTerms: existing.data.terms_snapshot as CommercialTermsInput,
      proposalDocumentType: existing.data.document_type as Parameters<typeof runPersistedCommercialComparison>[0]["proposalDocumentType"],
      quoteFileId: stored.data.id,
      actionDeadline: null
    });
    revalidatePath(contractPath(contractId));
    return replay;
  }

  if (stored.data.proposal_upload_status === "pending" && stored.data.idempotentReplay) {
    throw new Error("This proposal is already being processed. Wait for it to finish before retrying.");
  }

  const extractionRunLabel = randomUUID();
  let ingestion: ReturnType<typeof parseCommercialProposalSpreadsheet>;
  try {
    if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
      ingestion = parseCommercialProposalSpreadsheet({
        fileId: stored.data.id, buffer, fileName: file.name, extractionRunId: extractionRunLabel
      });
    } else {
      const prepared = await prepareCommercialProposalDocument({
        fileId: stored.data.id,
        fileName: file.name,
        mimeType: file.type,
        buffer
      });
      const extraction = await extractFullCommercialDocument({
        document: prepared.document,
        provider: new OpenAiCommercialExtractionProvider()
      });
      const proposedTerms = proposalTermsFromCommercialCandidates({
          fileId: stored.data.id,
          extractionRunLabel,
          fileName: file.name,
          fields: extraction.fields
      });
      ingestion = {
        ...proposedTerms,
        warnings: Array.from(new Set([
          ...proposedTerms.warnings,
          ...prepared.document.warnings,
          ...extraction.warnings,
          ...(prepared.requiresReview ? ["ocr_review_required"] : [])
        ])),
        requiresReview: true
      };
    }
  } catch {
    await failAdminRenewalProposalUpload({
      organizationId: context.organizationId,
      contractId,
      quoteFileId: stored.data.id,
      failureCode: "proposal_extraction_failed"
    }).catch(() => null);
    throw new Error("Proposal extraction could not complete safely. Review the file and retry.");
  }
  if (ingestion.terms.lineItems.length === 0) {
    await failAdminRenewalProposalUpload({
      organizationId: context.organizationId,
      contractId,
      quoteFileId: stored.data.id,
      failureCode: "proposal_no_comparable_terms"
    }).catch(() => null);
    throw new Error("The proposal needs manual review because no comparable commercial line was extracted.");
  }
  let comparison: Awaited<ReturnType<typeof runPersistedCommercialComparison>>;
  try {
    comparison = await runPersistedCommercialComparison({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id,
      proposalTerms: ingestion.terms,
      proposalDocumentType: ingestion.documentType,
      quoteFileId: stored.data.id,
      actionDeadline: null
    });
  } catch {
    await failAdminRenewalProposalUpload({
      organizationId: context.organizationId,
      contractId,
      quoteFileId: stored.data.id,
      failureCode: "proposal_comparison_failed"
    }).catch(() => null);
    throw new Error("Proposal comparison could not complete safely. Review the file and retry.");
  }
  const ready = await markAdminRenewalProposalUploadReady({
    organizationId: context.organizationId,
    contractId,
    quoteFileId: stored.data.id
  });
  if (ready.error || !ready.data || ready.data.proposal_upload_status !== "ready") {
    throw new Error("Proposal comparison completed, but the upload state changed before finalization. Refresh and retry.");
  }
  revalidatePath(contractPath(contractId));
  return comparison;
}

export async function reviewQuoteFindingAction(
  findingId: string,
  decision: "reviewed" | "dismissed" | "accepted"
) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_renewal_evidence");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "review_quote" });
  const finding = await reviewQuoteFinding({
    organizationId: context.organizationId,
    findingId,
    reviewerUserId: context.user.id,
    decision
  });

  await recalculateEvidenceReadiness({
    organizationId: context.organizationId,
    contractId: finding.contract_id,
    actorUserId: context.user.id,
    trigger: "quote_finding_reviewed"
  }).catch(() => null);

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
  await assertCanUseShippedAction(context, "manage_renewal_scenarios");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "create_scenario" });
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
  await assertCanUseShippedAction(context, "manage_renewal_scenarios");
  await enforceDesignPartnerBetaMutation({ organizationId: context.organizationId, action: "select_scenario" });
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
