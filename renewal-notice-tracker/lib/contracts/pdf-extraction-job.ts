import type { BackgroundJob } from "@/lib/background-jobs/job-types";
import { runFullDocumentContractExtraction } from "@/lib/contract-intelligence/python-extraction-runner";
import { mapExtractionEvidenceToLegacyMetadata } from "@/lib/contract-intelligence/legacy-metadata-adapter";
import { buildEvidenceRows } from "@/lib/contracts/evidence";
import { preparePdfRenewalExtractionForReview } from "@/lib/contracts/pdf-renewal-control";
import {
  getAdminPdfExtractionContext,
  persistAdminPdfExtractionForReview,
  transitionAdminPdfUploadAttempt,
  updateAdminPdfExtractionFile
} from "@/lib/contracts/repositories/admin-pdf-upload-repository";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PdfExtractionJobError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "PdfExtractionJobError";
  }
}

function payloadUuid(job: BackgroundJob, key: string) {
  const value = job.payload[key];
  return typeof value === "string" && UUID_PATTERN.test(value) ? value : null;
}

export function parseContractPdfExtractionPayload(job: BackgroundJob) {
  if (job.job_type !== "contract_pdf_extraction" || !job.contract_id) {
    throw new PdfExtractionJobError(
      "PDF extraction job has an invalid contract boundary.",
      "ERR_PDF_EXTRACTION_JOB_INVALID_001",
      false
    );
  }
  const contractFileId = payloadUuid(job, "contract_file_id");
  const uploadAttemptId = payloadUuid(job, "upload_attempt_id");
  const requestedByUserId = payloadUuid(job, "requested_by_user_id");
  if (!contractFileId || !uploadAttemptId || !requestedByUserId) {
    throw new PdfExtractionJobError(
      "PDF extraction job has invalid safe identifiers.",
      "ERR_PDF_EXTRACTION_JOB_PAYLOAD_001",
      false
    );
  }
  return { contractFileId, uploadAttemptId, requestedByUserId };
}

export async function processContractPdfExtractionBackgroundJob(input: {
  job: BackgroundJob;
  workerId: string;
}) {
  const payload = parseContractPdfExtractionPayload(input.job);
  const contractId = input.job.contract_id as string;
  const context = await getAdminPdfExtractionContext({
    organizationId: input.job.organization_id,
    contractId,
    contractFileId: payload.contractFileId,
    uploadAttemptId: payload.uploadAttemptId
  });
  if (context.error || !context.data) {
    throw new PdfExtractionJobError(
      "PDF extraction input is no longer available.",
      "ERR_PDF_EXTRACTION_INPUT_UNAVAILABLE_001",
      false
    );
  }
  if (context.data.pdf_upload_attempt_status === "needs_review") {
    return {
      status: "needs_review" as const,
      contractId,
      contractFileId: payload.contractFileId,
      uploadAttemptId: payload.uploadAttemptId,
      reviewReasons: [] as string[],
      idempotentReplay: true
    };
  }
  if (context.data.pdf_upload_attempt_status !== "processing") {
    throw new PdfExtractionJobError(
      "PDF upload attempt is no longer processing.",
      "ERR_PDF_EXTRACTION_STATE_CONFLICT_001",
      false
    );
  }

  const started = await transitionAdminPdfUploadAttempt({
    organizationId: input.job.organization_id,
    contractId,
    uploadAttemptId: payload.uploadAttemptId,
    allowedStatuses: ["processing"],
    values: { status: "extracting_text" }
  });
  if (started.error || !started.data) {
    throw new PdfExtractionJobError(
      "PDF extraction state could not be started safely.",
      "ERR_PDF_EXTRACTION_STATE_CONFLICT_001",
      false
    );
  }

  void emitOperationalEvent({
    eventName: "saas_pdf_extraction_started",
    severity: "P3",
    sensitivity: "customer_sensitive",
    alert: false,
    organizationId: input.job.organization_id,
    action: "contract_pdf_extraction",
    metadata: {
      job_id: input.job.id,
      contract_id: contractId,
      contract_file_id: payload.contractFileId,
      upload_attempt_id: payload.uploadAttemptId,
      worker_id: input.workerId,
      attempt_count: input.job.attempts + 1
    }
  });

  const extraction = await runFullDocumentContractExtraction({
    organizationId: input.job.organization_id,
    contractId,
    contractFileId: payload.contractFileId,
    requestedByUserId: payload.requestedByUserId
  });
  if (!extraction.ok) {
    throw new PdfExtractionJobError(
      extraction.safeMessage,
      "ERR_PDF_EXTRACTION_PROVIDER_001",
      true
    );
  }

  // Provider work can outlive the user's request. Re-check the scoped attempt
  // before persisting proposed data so an explicit abandonment wins safely.
  const currentContext = await getAdminPdfExtractionContext({
    organizationId: input.job.organization_id,
    contractId,
    contractFileId: payload.contractFileId,
    uploadAttemptId: payload.uploadAttemptId
  });
  if (
    currentContext.error ||
    !currentContext.data ||
    currentContext.data.pdf_upload_attempt_status !== "processing"
  ) {
    throw new PdfExtractionJobError(
      "PDF upload attempt changed before extraction could be persisted.",
      "ERR_PDF_EXTRACTION_STATE_CONFLICT_001",
      false
    );
  }

  const mapped = mapExtractionEvidenceToLegacyMetadata({
    fields: extraction.fields,
    fallbackTitle: "Contract pending review",
    partial: extraction.run?.status === "partial"
  });
  const metadata = preparePdfRenewalExtractionForReview(mapped, {
    extractionSource: "page_aware",
    ocrConfidence: null,
    parserError: extraction.run?.status === "partial"
      ? "Provider extraction completed with partial evidence."
      : null
  });
  const reviewReasons = metadata.pdf_renewal_review_reasons;
  const metadataValues: Record<string, unknown> = { ...metadata };

  const completedAt = new Date().toISOString();
  const persistence = await persistAdminPdfExtractionForReview({
    organizationId: input.job.organization_id,
    contractId,
    contractFileId: payload.contractFileId,
    uploadAttemptId: payload.uploadAttemptId,
    jobId: input.job.id,
    metadata: {
      ...metadataValues,
      needs_review: true,
      review_mode: "exception_review",
      review_reason: metadata.reviewer_notes,
      has_conflict: reviewReasons.includes("conflicting_dates"),
      has_derived_date: reviewReasons.includes("inferred_from_notice_period"),
      has_weak_evidence: reviewReasons.includes("weak_evidence") || reviewReasons.includes("ocr_low_confidence"),
      is_ocr_assisted: extraction.fields.some((field) => field.extraction_method === "ocr"),
      is_manual_without_evidence: false,
      changes_previously_verified_p0: false,
      accepted_unverified_risk_requested: false
    },
    evidence: buildEvidenceRows(metadata.field_source_snippets, metadata.field_confidence, "extraction"),
    ocrStatus: extraction.run?.status === "partial" ? "partial" : "completed",
    completedAt
  });
  if (persistence.error) {
    throw new PdfExtractionJobError(
      "Extracted contract review state could not be persisted atomically.",
      "ERR_PDF_EXTRACTION_METADATA_001",
      true
    );
  }
  const persistenceResult = persistence.data && typeof persistence.data === "object" && !Array.isArray(persistence.data)
    ? persistence.data as Record<string, unknown>
    : {};
  if (persistenceResult.persisted !== true) {
    throw new PdfExtractionJobError(
      "PDF upload attempt changed before extraction could be persisted.",
      "ERR_PDF_EXTRACTION_STATE_CONFLICT_001",
      false
    );
  }

  await createAuditLog({
    organizationId: input.job.organization_id,
    actorUserId: payload.requestedByUserId,
    contractId,
    action: "contract.created",
    entityType: "contract",
    entityId: contractId,
    details: {
      source_type: "upload",
      extraction_source: "page_aware",
      extraction_job_id: input.job.id,
      pdf_renewal_review_reasons: reviewReasons,
      status: "needs_review"
    }
  });
  await trackServerAnalyticsEvent({
    organizationId: input.job.organization_id,
    actorUserId: payload.requestedByUserId,
    eventName: "contract_upload_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `contract_upload_completed:${contractId}`,
    properties: { contract_id: contractId, extraction_source: "page_aware" }
  });
  await trackServerAnalyticsEvent({
    organizationId: input.job.organization_id,
    actorUserId: payload.requestedByUserId,
    eventName: "extraction_completed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `extraction_result:${contractId}:needs_review`,
    properties: {
      contract_id: contractId,
      extraction_source: "page_aware",
      needs_review: true
    }
  });
  await recalculateEvidenceReadiness({
    organizationId: input.job.organization_id,
    contractId,
    actorUserId: payload.requestedByUserId,
    trigger: "contract_extraction_completed"
  }).catch(() => null);

  void emitOperationalEvent({
    eventName: "saas_pdf_extraction_completed",
    severity: "P3",
    sensitivity: "customer_sensitive",
    alert: false,
    organizationId: input.job.organization_id,
    action: "contract_pdf_extraction",
    metadata: {
      job_id: input.job.id,
      contract_id: contractId,
      contract_file_id: payload.contractFileId,
      upload_attempt_id: payload.uploadAttemptId,
      status: "needs_review",
      review_reason_codes: reviewReasons
    }
  });

  return {
    status: "needs_review" as const,
    contractId,
    contractFileId: payload.contractFileId,
    uploadAttemptId: payload.uploadAttemptId,
    reviewReasons
  };
}

export async function markContractPdfExtractionTerminalFailure(input: {
  job: BackgroundJob;
  failureCode: string;
}) {
  const payload = parseContractPdfExtractionPayload(input.job);
  const failedAt = new Date().toISOString();
  const transition = await transitionAdminPdfUploadAttempt({
    organizationId: input.job.organization_id,
    contractId: input.job.contract_id as string,
    uploadAttemptId: payload.uploadAttemptId,
    allowedStatuses: ["processing"],
    values: {
      status: "extraction_failed",
      pdf_upload_attempt_status: "extraction_failed",
      pdf_upload_completed_at: failedAt,
      pdf_upload_failure_code: input.failureCode
    }
  });
  if (transition.error) throw transition.error;
  if (!transition.data) return { transitioned: false };

  await updateAdminPdfExtractionFile({
    organizationId: input.job.organization_id,
    contractId: input.job.contract_id as string,
    contractFileId: payload.contractFileId,
    values: {
      extraction_error: "PDF extraction exhausted its safe retry policy.",
      ocr_status: "failed"
    }
  });
  await createAuditLog({
    organizationId: input.job.organization_id,
    actorUserId: payload.requestedByUserId,
    contractId: input.job.contract_id,
    action: "contract.extraction_failed",
    entityType: "contract",
    entityId: input.job.contract_id,
    details: {
      extraction_job_id: input.job.id,
      failure_code: input.failureCode,
      status: "extraction_failed"
    }
  });
  await trackServerAnalyticsEvent({
    organizationId: input.job.organization_id,
    actorUserId: payload.requestedByUserId,
    eventName: "extraction_failed",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `extraction_result:${input.job.contract_id}:extraction_failed`,
    properties: { contract_id: input.job.contract_id, failure_code: input.failureCode }
  });
  return { transitioned: true };
}
