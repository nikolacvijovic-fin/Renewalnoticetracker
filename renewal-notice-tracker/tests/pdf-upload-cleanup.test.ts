import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cleanAdminPdfUploadStorage: vi.fn(),
  getAdminPdfUploadAttemptMetrics: vi.fn(),
  listAdminStalePdfUploadAttempts: vi.fn(),
  createAuditLog: vi.fn(),
  emitOperationalEvent: vi.fn()
}));

vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({ operations: { pdfUploadAttemptRetentionHours: 72 } })
}));
vi.mock("@/lib/contracts/repositories/admin-pdf-upload-repository", () => ({
  cleanAdminPdfUploadStorage: mocks.cleanAdminPdfUploadStorage,
  getAdminPdfUploadAttemptMetrics: mocks.getAdminPdfUploadAttemptMetrics,
  listAdminStalePdfUploadAttempts: mocks.listAdminStalePdfUploadAttempts
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: mocks.createAuditLog }));
vi.mock("@/lib/observability/monitoring", () => ({ emitOperationalEvent: mocks.emitOperationalEvent }));

import {
  cleanupStalePdfUploadAttempts,
  getPdfUploadAttemptOperationalMetrics
} from "@/lib/contracts/pdf-upload-cleanup";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    organization_id: "org-1",
    latest_file_id: "file-1",
    pdf_upload_attempt_id: "attempt-1",
    pdf_upload_attempt_status: "failed",
    contract_metadata: [],
    saas_contract_terms: [],
    contract_files: [{ id: "file-1", storage_path: "org-1/contract-1/file.pdf", storage_deleted_at: null }],
    ...overrides
  };
}

describe("PDF upload attempt cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cleanAdminPdfUploadStorage.mockResolvedValue({ data: { id: "contract-1" }, error: null });
    mocks.createAuditLog.mockResolvedValue(undefined);
    mocks.emitOperationalEvent.mockResolvedValue(undefined);
  });

  it("cleans only stale failed or abandoned unreviewed placeholders", async () => {
    mocks.listAdminStalePdfUploadAttempts.mockResolvedValue({
      data: [
        candidate(),
        candidate({ id: "reviewed", contract_metadata: [{ id: "metadata-1", reviewed_at: "2030-01-01T00:00:00Z" }] }),
        candidate({ id: "activated", saas_contract_terms: [{ id: "term-1" }] })
      ],
      error: null
    });

    const result = await cleanupStalePdfUploadAttempts({
      now: new Date("2030-01-04T00:00:00.000Z")
    });

    expect(result).toEqual({ cleaned: 1, protectedCount: 2, failedCount: 0, candidateCount: 3, retentionHours: 72 });
    expect(mocks.listAdminStalePdfUploadAttempts).toHaveBeenCalledWith({
      staleBeforeIso: "2030-01-01T00:00:00.000Z",
      limit: 50
    });
    expect(mocks.cleanAdminPdfUploadStorage).toHaveBeenCalledTimes(1);
    expect(mocks.cleanAdminPdfUploadStorage).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1",
      cleanedAt: "2030-01-04T00:00:00.000Z",
      staleBeforeIso: "2030-01-01T00:00:00.000Z"
    }));
    expect(mocks.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      contractId: "contract-1",
      action: "saas.pdf_upload_cleaned",
      details: expect.objectContaining({ from_status: "failed", to_status: "cleaned" })
    }), { mode: "best_effort" });
    expect(JSON.stringify(mocks.createAuditLog.mock.calls)).not.toMatch(
      /raw contract text|provider payload|storage_path|token|secret/i
    );
  });

  it("reports operational lifecycle counts without customer content", async () => {
    mocks.getAdminPdfUploadAttemptMetrics.mockResolvedValue({
      data: [
        { pdf_upload_attempt_status: "processing", pdf_upload_claimed_at: "2030-01-01T00:00:00Z", pdf_upload_recovery_count: 1 },
        { pdf_upload_attempt_status: "processing", pdf_upload_claimed_at: "2030-01-01T00:50:00Z", pdf_upload_recovery_count: 0 },
        { pdf_upload_attempt_status: "extraction_failed", pdf_upload_claimed_at: null, pdf_upload_recovery_count: 2 },
        { pdf_upload_attempt_status: "failed", pdf_upload_claimed_at: null, pdf_upload_recovery_count: 0 },
        { pdf_upload_attempt_status: "abandoned", pdf_upload_claimed_at: null, pdf_upload_recovery_count: 0 },
        { pdf_upload_attempt_status: "cleaned", pdf_upload_claimed_at: null, pdf_upload_recovery_count: 0 }
      ],
      error: null
    });

    await expect(getPdfUploadAttemptOperationalMetrics({
      now: new Date("2030-01-01T01:00:00Z")
    })).resolves.toEqual({
      processing: 2,
      stale: 1,
      failed: 2,
      abandoned: 1,
      recovered: 3,
      cleaned: 1
    });
  });

  it("counts failed cleanup attempts without recording a false cleanup audit", async () => {
    mocks.listAdminStalePdfUploadAttempts.mockResolvedValue({ data: [candidate()], error: null });
    mocks.cleanAdminPdfUploadStorage.mockResolvedValue({
      data: null,
      error: new Error("storage cleanup failed")
    });

    await expect(cleanupStalePdfUploadAttempts({
      now: new Date("2030-01-04T00:00:00.000Z")
    })).resolves.toEqual({
      cleaned: 0,
      protectedCount: 0,
      failedCount: 1,
      candidateCount: 1,
      retentionHours: 72
    });
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
    expect(mocks.emitOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        cleaned_count: 0,
        failed_count: 1
      })
    }));
  });
});
