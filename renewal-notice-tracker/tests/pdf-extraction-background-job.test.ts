import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runFullDocumentContractExtraction: vi.fn(),
  mapExtractionEvidenceToLegacyMetadata: vi.fn(),
  preparePdfRenewalExtractionForReview: vi.fn(),
  buildEvidenceRows: vi.fn(),
  getAdminPdfExtractionContext: vi.fn(),
  replaceAdminPdfEvidenceRows: vi.fn(),
  transitionAdminPdfUploadAttempt: vi.fn(),
  updateAdminPdfExtractionFile: vi.fn(),
  upsertAdminPdfContractMetadata: vi.fn(),
  createAuditLog: vi.fn(),
  trackServerAnalyticsEvent: vi.fn(),
  recalculateEvidenceReadiness: vi.fn(),
  emitOperationalEvent: vi.fn()
}));

vi.mock("@/lib/contract-intelligence/python-extraction-runner", () => ({
  runFullDocumentContractExtraction: mocks.runFullDocumentContractExtraction
}));
vi.mock("@/lib/contract-intelligence/legacy-metadata-adapter", () => ({
  mapExtractionEvidenceToLegacyMetadata: mocks.mapExtractionEvidenceToLegacyMetadata
}));
vi.mock("@/lib/contracts/pdf-renewal-control", () => ({
  preparePdfRenewalExtractionForReview: mocks.preparePdfRenewalExtractionForReview
}));
vi.mock("@/lib/contracts/evidence", () => ({ buildEvidenceRows: mocks.buildEvidenceRows }));
vi.mock("@/lib/contracts/repositories/admin-pdf-upload-repository", () => ({
  getAdminPdfExtractionContext: mocks.getAdminPdfExtractionContext,
  replaceAdminPdfEvidenceRows: mocks.replaceAdminPdfEvidenceRows,
  transitionAdminPdfUploadAttempt: mocks.transitionAdminPdfUploadAttempt,
  updateAdminPdfExtractionFile: mocks.updateAdminPdfExtractionFile,
  upsertAdminPdfContractMetadata: mocks.upsertAdminPdfContractMetadata
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent: mocks.trackServerAnalyticsEvent
}));
vi.mock("@/lib/evidence-readiness/evidence-readiness-service", () => ({
  recalculateEvidenceReadiness: mocks.recalculateEvidenceReadiness
}));
vi.mock("@/lib/observability/monitoring", () => ({ emitOperationalEvent: mocks.emitOperationalEvent }));

import {
  markContractPdfExtractionTerminalFailure,
  PdfExtractionJobError,
  processContractPdfExtractionBackgroundJob
} from "@/lib/contracts/pdf-extraction-job";
import type { BackgroundJob } from "@/lib/background-jobs/job-types";

const organizationId = "11111111-1111-4111-8111-111111111111";
const contractId = "22222222-2222-4222-8222-222222222222";
const contractFileId = "33333333-3333-4333-8333-333333333333";
const uploadAttemptId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";

function job(): BackgroundJob {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    organization_id: organizationId,
    contract_id: contractId,
    job_type: "contract_pdf_extraction",
    status: "processing",
    priority: 100,
    idempotency_key: `contract_pdf_extraction:${uploadAttemptId}`,
    payload: {
      contract_file_id: contractFileId,
      upload_attempt_id: uploadAttemptId,
      requested_by_user_id: userId
    },
    attempts: 0,
    max_attempts: 3,
    scheduled_for: "2030-01-01T00:00:00.000Z",
    locked_at: "2030-01-01T00:00:00.000Z",
    lease_expires_at: "2030-01-01T00:10:00.000Z",
    locked_by: "worker-1",
    last_error_code: null,
    last_error_message: null,
    completed_at: null,
    dead_lettered_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  };
}

describe("contract PDF extraction background job", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminPdfExtractionContext.mockResolvedValue({
      data: { pdf_upload_attempt_status: "processing" },
      error: null
    });
    mocks.transitionAdminPdfUploadAttempt.mockResolvedValue({ data: { id: contractId }, error: null });
    mocks.runFullDocumentContractExtraction.mockResolvedValue({
      ok: true,
      run: { status: "completed" },
      fields: []
    });
    mocks.mapExtractionEvidenceToLegacyMetadata.mockReturnValue({ contract_title: "Acme Cloud" });
    mocks.preparePdfRenewalExtractionForReview.mockReturnValue({
      contract_title: "Acme Cloud",
      reviewer_notes: "Review the proposed deadline.",
      field_source_snippets: {},
      field_confidence: {},
      pdf_renewal_review_reasons: ["weak_evidence"]
    });
    mocks.buildEvidenceRows.mockReturnValue([]);
    mocks.upsertAdminPdfContractMetadata.mockResolvedValue({ data: { id: "metadata-1" }, error: null });
    mocks.replaceAdminPdfEvidenceRows.mockResolvedValue({ error: null });
    mocks.updateAdminPdfExtractionFile.mockResolvedValue({ data: { id: contractFileId }, error: null });
    mocks.createAuditLog.mockResolvedValue(undefined);
    mocks.trackServerAnalyticsEvent.mockResolvedValue(undefined);
    mocks.recalculateEvidenceReadiness.mockResolvedValue(undefined);
    mocks.emitOperationalEvent.mockResolvedValue(undefined);
  });

  it("persists review state through organization-scoped repositories", async () => {
    const result = await processContractPdfExtractionBackgroundJob({ job: job(), workerId: "worker-1" });

    expect(result).toMatchObject({
      status: "needs_review",
      contractId,
      contractFileId,
      uploadAttemptId,
      reviewReasons: ["weak_evidence"]
    });
    expect(mocks.getAdminPdfExtractionContext).toHaveBeenCalledWith({
      organizationId,
      contractId,
      contractFileId,
      uploadAttemptId
    });
    expect(mocks.transitionAdminPdfUploadAttempt).toHaveBeenLastCalledWith(expect.objectContaining({
      organizationId,
      contractId,
      uploadAttemptId,
      allowedStatuses: ["processing"],
      values: expect.objectContaining({ pdf_upload_attempt_status: "needs_review" })
    }));
    expect(mocks.replaceAdminPdfEvidenceRows).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      contractId,
      metadataId: "metadata-1"
    }));
    const serialized = JSON.stringify([
      mocks.createAuditLog.mock.calls,
      mocks.trackServerAnalyticsEvent.mock.calls,
      mocks.emitOperationalEvent.mock.calls
    ]);
    expect(serialized).not.toMatch(/raw contract text|provider payload|storage_path|token|secret/i);
  });

  it("fails closed when extracted metadata cannot be persisted", async () => {
    mocks.upsertAdminPdfContractMetadata.mockResolvedValue({
      data: null,
      error: new Error("database unavailable")
    });

    await expect(
      processContractPdfExtractionBackgroundJob({ job: job(), workerId: "worker-1" })
    ).rejects.toMatchObject({
      name: "PdfExtractionJobError",
      code: "ERR_PDF_EXTRACTION_METADATA_001",
      retryable: true
    });
    expect(mocks.replaceAdminPdfEvidenceRows).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("does not persist provider output after the upload is abandoned", async () => {
    mocks.getAdminPdfExtractionContext
      .mockResolvedValueOnce({ data: { pdf_upload_attempt_status: "processing" }, error: null })
      .mockResolvedValueOnce({ data: { pdf_upload_attempt_status: "abandoned" }, error: null });

    await expect(
      processContractPdfExtractionBackgroundJob({ job: job(), workerId: "worker-1" })
    ).rejects.toMatchObject({
      code: "ERR_PDF_EXTRACTION_STATE_CONFLICT_001",
      retryable: false
    });
    expect(mocks.upsertAdminPdfContractMetadata).not.toHaveBeenCalled();
    expect(mocks.replaceAdminPdfEvidenceRows).not.toHaveBeenCalled();
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it("treats provider failure as retryable without persisting unsafe provider details", async () => {
    mocks.runFullDocumentContractExtraction.mockResolvedValue({
      ok: false,
      safeMessage: "Extraction provider is temporarily unavailable."
    });

    await expect(
      processContractPdfExtractionBackgroundJob({ job: job(), workerId: "worker-1" })
    ).rejects.toEqual(expect.objectContaining({
      code: "ERR_PDF_EXTRACTION_PROVIDER_001",
      retryable: true
    } satisfies Partial<PdfExtractionJobError>));
    expect(mocks.upsertAdminPdfContractMetadata).not.toHaveBeenCalled();
  });

  it("marks terminal failure once and writes only safe identifiers", async () => {
    const result = await markContractPdfExtractionTerminalFailure({
      job: job(),
      failureCode: "ERR_PDF_EXTRACTION_PROVIDER_001"
    });

    expect(result).toEqual({ transitioned: true });
    expect(mocks.transitionAdminPdfUploadAttempt).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      contractId,
      uploadAttemptId,
      allowedStatuses: ["processing"],
      values: expect.objectContaining({
        pdf_upload_attempt_status: "extraction_failed",
        pdf_upload_failure_code: "ERR_PDF_EXTRACTION_PROVIDER_001"
      })
    }));
    expect(JSON.stringify(mocks.createAuditLog.mock.calls)).not.toMatch(
      /raw contract text|provider payload|storage_path|token|secret/i
    );
  });
});
