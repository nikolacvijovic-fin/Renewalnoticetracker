import type { Json } from "@/lib/supabase/database.types";
import {
  COMMERCIAL_FIELD_REGISTRY,
  type CommercialFieldKey
} from "@/lib/contract-intelligence/commercial-schema";

export const EXTRACTED_FIELD_KEYS = Object.keys(COMMERCIAL_FIELD_REGISTRY) as CommercialFieldKey[];

export type ExtractedFieldKey = CommercialFieldKey;

export const CONTRACT_EXTRACTION_RUN_STATUSES = [
  "queued",
  "processing",
  "completed",
  "partial",
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
  idempotency_key?: string | null;
  schema_version?: string;
  prompt_version?: string | null;
  model?: string | null;
  page_count?: number;
  processed_page_count?: number;
  input_character_count?: number;
  input_token_count?: number | null;
  output_token_count?: number | null;
  estimated_cost?: number | null;
  attempt_count?: number;
  next_attempt_at?: string | null;
  processing_lease_expires_at?: string | null;
  warning_codes?: string[];
  created_at: string;
  updated_at: string;
};

export type ContractExtractedField = {
  id: string;
  organization_id: string;
  contract_id: string;
  extraction_run_id: string;
  field_key: ExtractedFieldKey;
  field_category?: string;
  candidate_index?: number;
  extracted_value: Json;
  normalized_value: Json | null;
  confidence: number;
  evidence_status: ExtractedFieldEvidenceStatus;
  source_file_id: string | null;
  source_page: number | null;
  source_snippet: string | null;
  source_offsets: Json | null;
  source_section_label?: string | null;
  source_clause_label?: string | null;
  extraction_method?: string | null;
  extraction_provider?: string | null;
  extraction_model?: string | null;
  prompt_version?: string | null;
  schema_version?: string;
  edited_value?: Json | null;
  override_reason?: string | null;
  warning_codes: string[];
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  applied_to_contract_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

export type ContractDocumentRelationship = {
  id: string;
  organization_id: string;
  contract_id: string;
  source_file_id: string;
  target_file_id: string;
  relationship_type: "amends" | "supersedes" | "order_under" | "quote_for" | "related";
  effective_date: string | null;
  confidence: number;
  evidence_status: "pending_review" | "accepted" | "rejected";
  evidence_field_ids: string[];
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ContractExtractionRequest = {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  requestedByUserId?: string | null;
  extractionMode?: ContractExtractionMode;
  idempotencyKey?: string | null;
  schemaVersion?: string;
  promptVersion?: string | null;
};

export type ContractExtractionResultField = {
  fieldKey: ExtractedFieldKey;
  extractedValue: Json;
  normalizedValue?: Json | null;
  confidence: number;
  citations: FieldCitation[];
  warningCodes?: string[];
  category?: string;
  sectionLabel?: string | null;
  clauseLabel?: string | null;
  extractionMethod?: string | null;
  provider?: string | null;
  model?: string | null;
  promptVersion?: string | null;
  schemaVersion?: string;
};

export type ContractExtractionResult = {
  provider: "python_intelligence" | string;
  extractionMode: ContractExtractionMode;
  fields: ContractExtractionResultField[];
  overallConfidence: number;
  warnings: string[];
  status?: "completed" | "partial";
  pageCount?: number;
  processedPageCount?: number;
  inputCharacterCount?: number;
  inputTokenCount?: number;
  outputTokenCount?: number;
  model?: string | null;
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
