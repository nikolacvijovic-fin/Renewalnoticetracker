import type { Json } from "@/lib/supabase/database.types";

export const EXTRACTED_FIELD_KEYS = [
  "vendor_name",
  "renewal_date",
  "notice_deadline_date",
  "auto_renewal",
  "contract_value_amount",
  "contract_value_currency",
  "renewal_term",
  "termination_window",
  "price_change_trigger",
  "payment_terms"
] as const;

export type ExtractedFieldKey = (typeof EXTRACTED_FIELD_KEYS)[number];

export const CONTRACT_EXTRACTION_RUN_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled"
] as const;

export type ContractExtractionRunStatus = (typeof CONTRACT_EXTRACTION_RUN_STATUSES)[number];

export const EXTRACTED_FIELD_EVIDENCE_STATUSES = [
  "pending_review",
  "accepted",
  "rejected",
  "superseded"
] as const;

export type ExtractedFieldEvidenceStatus = (typeof EXTRACTED_FIELD_EVIDENCE_STATUSES)[number];

export type ContractExtractionMode = "deterministic_scaffold" | "provider_backed";

export type FieldCitation = {
  sourceFileId?: string | null;
  page?: number | null;
  snippet?: string | null;
  offsets?: Record<string, Json | undefined> | null;
};

export type ContractExtractionRun = {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_file_id: string | null;
  provider: string;
  status: ContractExtractionRunStatus;
  extraction_mode: ContractExtractionMode;
  requested_by_user_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  safe_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractExtractedField = {
  id: string;
  organization_id: string;
  contract_id: string;
  extraction_run_id: string;
  field_key: ExtractedFieldKey;
  extracted_value: Json;
  normalized_value: Json | null;
  confidence: number;
  evidence_status: ExtractedFieldEvidenceStatus;
  source_file_id: string | null;
  source_page: number | null;
  source_snippet: string | null;
  source_offsets: Json | null;
  warning_codes: string[];
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  applied_to_contract_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type ContractExtractionRequest = {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  requestedByUserId?: string | null;
  extractionMode?: ContractExtractionMode;
};

export type ContractExtractionResultField = {
  fieldKey: ExtractedFieldKey;
  extractedValue: Json;
  normalizedValue?: Json | null;
  confidence: number;
  citations: FieldCitation[];
  warningCodes?: string[];
};

export type ContractExtractionResult = {
  provider: "python_intelligence" | string;
  extractionMode: ContractExtractionMode;
  fields: ContractExtractionResultField[];
  overallConfidence: number;
  warnings: string[];
};

export type ApplyExtractedFieldInput = {
  organizationId: string;
  contractId: string;
  reviewerUserId: string;
  fieldIds?: string[];
};

export function isExtractedFieldKey(value: string): value is ExtractedFieldKey {
  return (EXTRACTED_FIELD_KEYS as readonly string[]).includes(value);
}
