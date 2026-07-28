import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  computeExtractionEvidenceConfidence,
  normalizeExtractionResultField,
  sanitizeExtractionSourceSnippet
} from "@/lib/contract-intelligence/extraction-evidence";
import {
  insertAdminContractExtractedFields,
  insertAdminContractExtractionRun,
  listAdminContractExtractedFields,
  listAdminContractExtractionRuns,
  updateAdminContractExtractedFieldReview,
  updateAdminContractExtractionRun
} from "@/lib/contract-intelligence/repositories/admin-extraction-repository";
import type {
  ContractExtractedField,
  ContractExtractionRequest,
  ContractExtractionResult
} from "@/lib/contract-intelligence/extraction-types";

function safeAuditMetadata(input: Record<string, unknown>) {
  return {
    ...input,
    sourceSnippet: undefined,
    rawText: undefined,
    providerPayload: undefined
  };
}

export async function requestContractExtraction(input: ContractExtractionRequest) {
  const result = await insertAdminContractExtractionRun({
    organizationId: input.organizationId,
    contractId: input.contractId,
    contractFileId: input.contractFileId ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    extractionMode: input.extractionMode ?? "deterministic_scaffold"
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Contract extraction run was not created.");

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.requestedByUserId ?? null,
    eventType: "contract_extraction.requested",
    eventCategory: "evidence",
    eventSource: "contract_extraction",
    severity: "warning",
    metadata: safeAuditMetadata({
      runId: result.data.id,
      contractFileId: input.contractFileId ?? null,
      provider: result.data.provider,
      extractionMode: result.data.extraction_mode
    }),
    mode: "best_effort"
  });

  return result.data;
}

export async function recordContractExtractionResult(input: {
  organizationId: string;
  contractId: string;
  extractionRunId: string;
  actorUserId?: string | null;
  result: ContractExtractionResult;
}) {
  const now = new Date().toISOString();
  const fields = input.result.fields.map(normalizeExtractionResultField);
  const inserted = await insertAdminContractExtractedFields({
    organizationId: input.organizationId,
    contractId: input.contractId,
    extractionRunId: input.extractionRunId,
    fields
  });
  if (inserted.error) throw inserted.error;

  const confidence = computeExtractionEvidenceConfidence(input.result.fields);
  const completed = await updateAdminContractExtractionRun({
    organizationId: input.organizationId,
    runId: input.extractionRunId,
    values: {
      status: "completed",
      completed_at: now,
      safe_error_message: null
    }
  });
  if (completed.error) throw completed.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "contract_extraction.completed",
    eventCategory: "evidence",
    eventSource: "contract_extraction",
    severity: confidence < 0.75 ? "warning" : "info",
    metadata: safeAuditMetadata({
      runId: input.extractionRunId,
      provider: input.result.provider,
      extractionMode: input.result.extractionMode,
      fieldKeys: input.result.fields.map((field) => field.fieldKey),
      confidenceValues: input.result.fields.map((field) => field.confidence),
      overallConfidence: input.result.overallConfidence,
      computedEvidenceConfidence: confidence,
      warningCodes: input.result.warnings
    }),
    mode: "best_effort"
  });

  return {
    run: completed.data,
    fields: inserted.data ?? [],
    computedEvidenceConfidence: confidence
  };
}

export async function failContractExtractionRun(input: {
  organizationId: string;
  contractId: string;
  extractionRunId: string;
  actorUserId?: string | null;
  safeErrorMessage: string;
}) {
  const safeErrorMessage = sanitizeExtractionSourceSnippet(input.safeErrorMessage) ?? "Contract extraction failed.";
  const failed = await updateAdminContractExtractionRun({
    organizationId: input.organizationId,
    runId: input.extractionRunId,
    values: {
      status: "failed",
      failed_at: new Date().toISOString(),
      safe_error_message: safeErrorMessage
    }
  });
  if (failed.error) throw failed.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "contract_extraction.failed",
    eventCategory: "evidence",
    eventSource: "contract_extraction",
    severity: "critical",
    metadata: safeAuditMetadata({
      runId: input.extractionRunId,
      failureCode: "ERR_CONTRACT_EXTRACTION_FAILED_001",
      safeErrorMessage
    }),
    mode: "best_effort"
  });

  return failed.data;
}

export async function listContractExtractionRuns(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  const result = await listAdminContractExtractionRuns(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function listContractExtractedFields(input: {
  organizationId: string;
  contractId: string;
  extractionRunId?: string;
  evidenceStatus?: string;
}) {
  const result = await listAdminContractExtractedFields(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function reviewExtractedField(input: {
  organizationId: string;
  contractId: string;
  fieldId: string;
  reviewerUserId: string;
}) {
  const reviewedAt = new Date().toISOString();
  const result = await updateAdminContractExtractedFieldReview({
    organizationId: input.organizationId,
    fieldId: input.fieldId,
    values: {
      evidence_status: "accepted",
      reviewed_by_user_id: input.reviewerUserId,
      reviewed_at: reviewedAt,
      rejected_at: null,
      rejection_reason: null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Extracted field was not found.");

  await auditFieldDecision("contract_extracted_field.accepted", result.data, input.reviewerUserId);
  return result.data;
}

export async function rejectExtractedField(input: {
  organizationId: string;
  contractId: string;
  fieldId: string;
  reviewerUserId: string;
  reason?: string | null;
}) {
  const reviewedAt = new Date().toISOString();
  const result = await updateAdminContractExtractedFieldReview({
    organizationId: input.organizationId,
    fieldId: input.fieldId,
    values: {
      evidence_status: "rejected",
      reviewed_by_user_id: input.reviewerUserId,
      reviewed_at: reviewedAt,
      rejected_at: reviewedAt,
      rejection_reason: sanitizeExtractionSourceSnippet(input.reason) ?? null
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Extracted field was not found.");

  await auditFieldDecision("contract_extracted_field.rejected", result.data, input.reviewerUserId);
  return result.data;
}

async function auditFieldDecision(
  eventType: "contract_extracted_field.accepted" | "contract_extracted_field.rejected",
  field: ContractExtractedField,
  reviewerUserId: string
) {
  await recordEnterpriseAuditEvent({
    organizationId: field.organization_id,
    contractId: field.contract_id,
    actorUserId: reviewerUserId,
    eventType,
    eventCategory: "evidence",
    eventSource: "contract_extraction",
    severity: eventType.endsWith("rejected") || field.confidence < 0.75 ? "warning" : "info",
    metadata: safeAuditMetadata({
      runId: field.extraction_run_id,
      fieldId: field.id,
      fieldKey: field.field_key,
      confidence: field.confidence,
      warningCodes: field.warning_codes,
      reviewerId: reviewerUserId
    }),
    mode: "best_effort"
  });
}
