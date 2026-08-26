import { computeNeedsReview, extractedFieldSchema } from "@/lib/validation/contract";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";

function best(fields: ContractExtractedField[], key: string) {
  return fields
    .filter((field) => field.field_key === key && field.evidence_status !== "rejected")
    .sort((left, right) => right.confidence - left.confidence)[0];
}

function value(field: ContractExtractedField | undefined) {
  return field?.edited_value ?? field?.normalized_value ?? field?.extracted_value ?? null;
}

export function mapExtractionEvidenceToLegacyMetadata(input: {
  fields: ContractExtractedField[];
  fallbackTitle: string;
  partial: boolean;
}) {
  const asString = (key: string) => {
    const candidate = value(best(input.fields, key));
    return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
  };
  const asNumber = (key: string) => {
    const candidate = value(best(input.fields, key));
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : null;
  };
  const asBoolean = (key: string) => {
    const candidate = value(best(input.fields, key));
    return typeof candidate === "boolean" ? candidate : null;
  };
  const fieldConfidence: Record<string, number> = {};
  const fieldSourceSnippets: Record<string, string> = {};
  for (const field of input.fields) {
    const key = field.field_key === "vendor_name" ? "counterparty_name" : field.field_key;
    if ((fieldConfidence[key] ?? -1) >= field.confidence) continue;
    fieldConfidence[key] = field.confidence;
    if (field.source_snippet) fieldSourceSnippets[key] = field.source_snippet;
  }

  const parsed = extractedFieldSchema.parse({
    contract_title: asString("contract_title") ?? input.fallbackTitle,
    counterparty_name: asString("vendor_name"),
    contract_type: asString("document_type"),
    effective_date: asString("effective_date"),
    renewal_date: asString("renewal_date"),
    expiration_date: asString("expiration_date"),
    auto_renewal: asBoolean("auto_renewal"),
    renewal_term: asString("renewal_term"),
    notice_period_value: null,
    notice_period_unit: null,
    notice_deadline_date: asString("notice_deadline_date"),
    termination_window: asString("termination_for_convenience"),
    governing_law: null,
    payment_terms: asString("payment_terms"),
    contract_value_amount: asNumber("contract_value_amount"),
    contract_value_currency: asString("contract_value_currency"),
    contract_value_period: asString("billing_frequency"),
    price_change_trigger: asString("vendor_price_change_rights"),
    payment_trigger: asString("payment_timing_trigger"),
    financial_data_trust_status: "low",
    extracted_clauses: [],
    field_confidence: fieldConfidence,
    field_source_snippets: fieldSourceSnippets,
    reminder_recommendations: [],
    reviewer_notes: input.partial
      ? "Full-document extraction completed partially. Review every critical field before operational use."
      : "Full-document provider extraction is proposed evidence and requires human review."
  });
  return { ...parsed, needs_review: computeNeedsReview(parsed) };
}
