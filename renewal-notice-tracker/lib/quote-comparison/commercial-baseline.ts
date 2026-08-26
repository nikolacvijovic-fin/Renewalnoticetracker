import type { Json } from "@/lib/supabase/database.types";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";
import type { ContractDocumentRelationship } from "@/lib/contract-intelligence/extraction-types";
import { selectEffectiveAcceptedField } from "@/lib/contract-intelligence/document-precedence";
import {
  COMMERCIAL_CALCULATION_VERSION,
  type CommercialEvidenceReference,
  type CommercialLineItemInput,
  type CommercialTermsInput
} from "@/lib/quote-comparison/commercial-comparison-engine";

export type CommercialBaselineDraft = {
  contractId: string;
  sourceExtractionRunId: string;
  sourceExtractionRunIds: string[];
  sourceFileIds: string[];
  reviewedByUserId: string;
  effectiveDate: string | null;
  calculationVersion: string;
  completenessStatus: "complete" | "partial" | "insufficient";
  missingDataWarnings: string[];
  evidenceFieldIds: string[];
  terms: CommercialTermsInput;
};

function scalar(value: Json | null | undefined): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return null;
}

function numberValue(field: ContractExtractedField | undefined) {
  const value = scalar(field?.edited_value ?? field?.normalized_value ?? field?.extracted_value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringValue(field: ContractExtractedField | undefined) {
  const value = scalar(field?.edited_value ?? field?.normalized_value ?? field?.extracted_value);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function booleanValue(field: ContractExtractedField | undefined) {
  const value = scalar(field?.edited_value ?? field?.normalized_value ?? field?.extracted_value);
  return typeof value === "boolean" ? value : null;
}

function evidence(field: ContractExtractedField): CommercialEvidenceReference {
  return {
    evidenceId: field.id,
    sourceFileId: field.source_file_id ?? "unknown-source-file",
    extractionRunId: field.extraction_run_id,
    state: "accepted",
    page: field.source_page,
    label: field.source_clause_label ?? field.source_section_label ?? field.field_key
  };
}

function billingPeriod(value: string | null): CommercialLineItemInput["billingPeriod"] {
  switch (value?.toLowerCase()) {
    case "monthly": return "monthly";
    case "quarterly": return "quarterly";
    case "multi-year":
    case "multi_year": return "multi_year";
    default: return "annual";
  }
}

function acceptedLatest(fields: ContractExtractedField[], relationships: ContractDocumentRelationship[]) {
  const byKey = new Map<string, ContractExtractedField>();
  for (const fieldKey of new Set(fields.map((field) => field.field_key))) {
    const selected = selectEffectiveAcceptedField({ fields, fieldKey, relationships });
    if (selected && !selected.rejected_at) byKey.set(fieldKey, selected);
  }
  return byKey;
}

export function buildCommercialBaselineFromReviewedEvidence(input: {
  contractId: string;
  reviewerUserId: string;
  fields: ContractExtractedField[];
  relationships?: ContractDocumentRelationship[];
  effectiveDate?: string | null;
}): CommercialBaselineDraft {
  const byKey = acceptedLatest(input.fields, input.relationships ?? []);
  const selected = [...byKey.values()];
  if (selected.length === 0) throw new Error("accepted_commercial_evidence_required");

  const sourceExtractionRunIds = [...new Set(selected.map((field) => field.extraction_run_id))];
  const amount = numberValue(byKey.get("committed_annual_cost")) ?? numberValue(byKey.get("contract_value_amount"));
  const totalCommitment = numberValue(byKey.get("total_committed_cost"));
  const currency = stringValue(byKey.get("contract_value_currency"))?.toUpperCase() ?? null;
  const recurring = numberValue(byKey.get("recurring_fees"));
  const oneTime = numberValue(byKey.get("one_time_fees"));
  const quantity = numberValue(byKey.get("quantities"));
  const unitPrice = numberValue(byKey.get("unit_prices"));
  const productName = stringValue(byKey.get("products")) ?? stringValue(byKey.get("contract_title")) ?? "Contract commitment";
  const itemEvidence = selected
    .filter((field) => ["committed_annual_cost", "contract_value_amount", "contract_value_currency", "recurring_fees", "one_time_fees", "quantities", "unit_prices", "products", "contract_title", "discounts"].includes(field.field_key))
    .map(evidence);
  const lineItems: CommercialLineItemInput[] = [];
  if (currency && (recurring != null || amount != null || (quantity != null && unitPrice != null))) {
    lineItems.push({
      lineKey: "contract-commitment",
      productName,
      chargeType: "recurring",
      pricingModel: quantity != null && unitPrice != null ? "per_unit" : "flat",
      billingPeriod: billingPeriod(stringValue(byKey.get("billing_frequency"))),
      quantity,
      unitPrice,
      totalAmount: recurring ?? amount,
      currency,
      discountAmount: numberValue(byKey.get("discounts")),
      evidence: itemEvidence.length > 0 ? itemEvidence : selected.map(evidence)
    });
  }
  if (currency && oneTime != null) {
    lineItems.push({
      lineKey: "one-time-fees",
      productName: `${productName} one-time fees`,
      chargeType: "one_time",
      pricingModel: "flat",
      billingPeriod: "annual",
      totalAmount: oneTime,
      currency,
      evidence: byKey.get("one_time_fees") ? [evidence(byKey.get("one_time_fees")!)] : selected.map(evidence)
    });
  }

  const missingDataWarnings = [
    !currency ? "missing_reviewed_currency" : null,
    lineItems.length === 0 ? "missing_comparable_reviewed_charges" : null,
    !byKey.get("payment_terms") ? "missing_reviewed_payment_terms" : null,
    !byKey.get("notice_deadline_date") ? "missing_reviewed_notice_deadline" : null,
    !byKey.get("renewal_term") ? "missing_reviewed_renewal_term" : null
  ].filter((value): value is string => Boolean(value));
  const completenessStatus = lineItems.length === 0 || !currency
    ? "insufficient"
    : missingDataWarnings.length > 0 ? "partial" : "complete";

  return {
    contractId: input.contractId,
    sourceExtractionRunId: sourceExtractionRunIds[0]!,
    sourceExtractionRunIds,
    sourceFileIds: [...new Set(selected.flatMap((field) => field.source_file_id ? [field.source_file_id] : []))],
    reviewedByUserId: input.reviewerUserId,
    effectiveDate: input.effectiveDate ?? null,
    calculationVersion: COMMERCIAL_CALCULATION_VERSION,
    completenessStatus,
    missingDataWarnings,
    evidenceFieldIds: selected.map((field) => field.id),
    terms: {
      lineItems,
      statedAnnualTotal: amount,
      statedCommitmentTotal: totalCommitment,
      currency,
      paymentTerms: stringValue(byKey.get("payment_terms")),
      renewalTermMonths: numberValue(byKey.get("renewal_term")),
      noticePeriodDays: numberValue(byKey.get("notice_period")),
      autoRenewal: booleanValue(byKey.get("auto_renewal")),
      minimumSpend: numberValue(byKey.get("minimum_spend")),
      terminationCharge: numberValue(byKey.get("early_termination_fees")),
      upliftPercent: numberValue(byKey.get("fixed_uplift_percentage")),
      upliftCapped: byKey.has("uplift_cap_percentage") ? true : null,
      serviceCreditPercent: numberValue(byKey.get("service_level_credits")),
      evidence: selected.map(evidence)
    }
  };
}
