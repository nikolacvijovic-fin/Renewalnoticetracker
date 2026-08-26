import { createHash } from "node:crypto";
import { extractFullCommercialDocument } from "@/lib/contract-intelligence/full-document-extractor";
import { OpenAiCommercialExtractionProvider } from "@/lib/contract-intelligence/openai-commercial-extractor";
import type { ParsedContractDocument } from "@/lib/contract-intelligence/document-parser";
import { extractedFieldSchema, computeNeedsReview } from "@/lib/validation/contract";
import { getAppConfig } from "@/lib/config";

function valueFor(fields: Awaited<ReturnType<typeof extractFullCommercialDocument>>["fields"], key: string) {
  const candidates = fields
    .filter((field) => field.fieldKey === key)
    .sort((left, right) => right.confidence - left.confidence);
  return candidates[0] ?? null;
}

/**
 * Compatibility adapter for the upload/OCR workflow. It uses the same complete,
 * chunked provider extraction engine as extraction runs; it is not a second
 * extraction source of truth. New review flows should persist extraction runs.
 */
export async function extractContractMetadata(documentText: string) {
  // Resolve provider configuration through the same validated boundary used by
  // the page-aware runtime before constructing the compatibility adapter.
  getAppConfig();
  const normalizedText = documentText.replace(/\u0000/g, "").trim();
  if (!normalizedText) throw new Error("No contract text was available for extraction.");

  const document: ParsedContractDocument = {
    fileId: "compatibility-text",
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(normalizedText),
    warnings: ["compatibility_text_adapter_no_page_boundaries"],
    pages: [{
      pageNumber: 1,
      text: normalizedText,
      textHash: createHash("sha256").update(normalizedText).digest("hex"),
      extractionMethod: "docx",
      ocrConfidence: null,
      blocks: [],
      warningCodes: ["compatibility_text_adapter_no_page_boundaries"]
    }]
  };
  const extraction = await extractFullCommercialDocument({
    document,
    provider: new OpenAiCommercialExtractionProvider()
  });

  const fieldConfidence: Record<string, number> = {};
  const fieldSourceSnippets: Record<string, string> = {};
  for (const field of extraction.fields) {
    const metadataKey = field.fieldKey === "vendor_name" ? "counterparty_name" : field.fieldKey;
    if (!(metadataKey in fieldConfidence) || field.confidence > (fieldConfidence[metadataKey] ?? -1)) {
      fieldConfidence[metadataKey] = field.confidence;
      if (field.citation.snippet) fieldSourceSnippets[metadataKey] = field.citation.snippet;
    }
  }

  const asString = (key: string) => {
    const value = valueFor(extraction.fields, key)?.normalizedValue ?? valueFor(extraction.fields, key)?.rawValue;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const asNumber = (key: string) => {
    const value = valueFor(extraction.fields, key)?.normalizedValue ?? valueFor(extraction.fields, key)?.rawValue;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const asBoolean = (key: string) => {
    const value = valueFor(extraction.fields, key)?.normalizedValue ?? valueFor(extraction.fields, key)?.rawValue;
    return typeof value === "boolean" ? value : null;
  };

  const parsed = extractedFieldSchema.parse({
    contract_title: asString("contract_title"),
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
    reviewer_notes: extraction.status === "partial"
      ? "Commercial extraction was partial. Review all critical fields before operational use."
      : "Provider-backed extraction requires human review before operational use."
  });

  return { ...parsed, needs_review: computeNeedsReview(parsed) };
}
