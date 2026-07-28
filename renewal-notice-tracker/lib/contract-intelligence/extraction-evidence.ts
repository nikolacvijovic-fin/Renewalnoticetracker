import type { Json } from "@/lib/supabase/database.types";
import {
  EXTRACTED_FIELD_KEYS,
  type ContractExtractedField,
  type ContractExtractionResultField,
  type ExtractedFieldKey,
  type FieldCitation
} from "@/lib/contract-intelligence/extraction-types";

const MAX_SOURCE_SNIPPET_LENGTH = 1000;
const MAX_METADATA_SNIPPET_LENGTH = 240;
const LOW_CONFIDENCE_THRESHOLD = 0.75;
const CRITICAL_FIELD_KEYS = new Set<ExtractedFieldKey>([
  "renewal_date",
  "notice_deadline_date",
  "auto_renewal",
  "contract_value_amount",
  "contract_value_currency"
]);

const SENSITIVE_TEXT_PATTERN =
  /raw\s+(?:contract|ocr|document)|ocr output|provider payload|storage path|supabase\/storage|secret|token|bearer|authorization|uploaded document|full note/i;

export type ContractMetadataPatch = {
  counterparty_name?: string | null;
  renewal_date?: string | null;
  notice_deadline_date?: string | null;
  auto_renewal?: boolean | null;
  contract_value_amount?: number | null;
  contract_value_currency?: string | null;
  renewal_term?: string | null;
  termination_window?: string | null;
  price_change_trigger?: string | null;
  payment_terms?: string | null;
  field_confidence: Record<string, number>;
  field_source_snippets: Record<string, string>;
  needs_review: boolean;
  has_weak_evidence: boolean;
  updated_at?: string;
};

function truncate(value: string, length: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (SENSITIVE_TEXT_PATTERN.test(normalized)) {
    return "Evidence snippet redacted because it contained sensitive raw content markers.";
  }
  return normalized.length > length ? `${normalized.slice(0, length - 3)}...` : normalized;
}

export function sanitizeExtractionSourceSnippet(value: unknown) {
  return typeof value === "string" ? truncate(value, MAX_SOURCE_SNIPPET_LENGTH) : null;
}

export function sanitizeExtractionMetadataSnippet(value: unknown) {
  return typeof value === "string" ? truncate(value, MAX_METADATA_SNIPPET_LENGTH) : null;
}

export function computeExtractionEvidenceConfidence(fields: Array<Pick<ContractExtractionResultField, "confidence" | "citations" | "warningCodes">>) {
  if (fields.length === 0) return 0;

  const total = fields.reduce((sum, field) => {
    const bounded = Math.min(1, Math.max(0, field.confidence));
    const citationPenalty = field.citations.some((citation) => sanitizeExtractionSourceSnippet(citation.snippet))
      ? 0
      : 0.25;
    const warningPenalty = (field.warningCodes ?? []).length > 0 ? 0.1 : 0;
    return sum + Math.max(0, bounded - citationPenalty - warningPenalty);
  }, 0);

  return Number((total / fields.length).toFixed(3));
}

export function getPrimaryCitation(citations: FieldCitation[] = []) {
  return citations.find((citation) => sanitizeExtractionSourceSnippet(citation.snippet)) ?? citations[0] ?? null;
}

export function normalizeExtractionResultField(field: ContractExtractionResultField) {
  const primaryCitation = getPrimaryCitation(field.citations);
  const confidence = Math.min(1, Math.max(0, Number(field.confidence)));
  const warningCodes = new Set(field.warningCodes ?? []);

  if (CRITICAL_FIELD_KEYS.has(field.fieldKey) && !sanitizeExtractionSourceSnippet(primaryCitation?.snippet)) {
    warningCodes.add("missing_critical_field_citation");
  }

  return {
    field_key: field.fieldKey,
    extracted_value: field.extractedValue,
    normalized_value: field.normalizedValue ?? null,
    confidence,
    source_file_id: primaryCitation?.sourceFileId ?? null,
    source_page: primaryCitation?.page ?? null,
    source_snippet: sanitizeExtractionSourceSnippet(primaryCitation?.snippet),
    source_offsets: (primaryCitation?.offsets ?? null) as Json | null,
    warning_codes: Array.from(warningCodes)
  };
}

function metadataKeyForExtractedField(fieldKey: ExtractedFieldKey) {
  if (fieldKey === "vendor_name") return "counterparty_name";
  return fieldKey;
}

function valueForMetadata(field: ContractExtractedField) {
  const value = field.normalized_value ?? field.extracted_value;
  switch (field.field_key) {
    case "auto_renewal":
      return typeof value === "boolean" ? value : null;
    case "contract_value_amount":
      return typeof value === "number" ? value : null;
    case "contract_value_currency":
      return typeof value === "string" ? value.toUpperCase().slice(0, 8) : null;
    default:
      return typeof value === "string" && value.trim() ? value.trim() : null;
  }
}

export function mapExtractedFieldsToContractMetadataPatch(input: {
  fields: ContractExtractedField[];
  existingFieldConfidence?: Record<string, number> | null;
  existingFieldSourceSnippets?: Record<string, string> | null;
  now?: string;
}): ContractMetadataPatch {
  const acceptedFields = input.fields.filter((field) => field.evidence_status === "accepted");
  const fieldConfidence = { ...(input.existingFieldConfidence ?? {}) };
  const fieldSourceSnippets = { ...(input.existingFieldSourceSnippets ?? {}) };
  const patch: ContractMetadataPatch = {
    field_confidence: fieldConfidence,
    field_source_snippets: fieldSourceSnippets,
    needs_review: true,
    has_weak_evidence: false,
    updated_at: input.now ?? new Date().toISOString()
  };

  for (const field of acceptedFields) {
    if (!(EXTRACTED_FIELD_KEYS as readonly string[]).includes(field.field_key)) continue;
    const metadataKey = metadataKeyForExtractedField(field.field_key);
    const value = valueForMetadata(field);

    if (value !== null) {
      (patch as Record<string, unknown>)[metadataKey] = value;
    }

    fieldConfidence[metadataKey] = Number(field.confidence);
    const snippet = sanitizeExtractionMetadataSnippet(field.source_snippet);
    if (snippet) {
      fieldSourceSnippets[metadataKey] = snippet;
    }
    if (field.confidence < LOW_CONFIDENCE_THRESHOLD || field.warning_codes.length > 0) {
      patch.has_weak_evidence = true;
    }
  }

  return patch;
}
