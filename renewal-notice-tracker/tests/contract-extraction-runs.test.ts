import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  insertAdminContractExtractionRun: vi.fn(),
  updateAdminContractExtractionRun: vi.fn(),
  insertAdminContractExtractedFields: vi.fn(),
  listAdminContractExtractionRuns: vi.fn(),
  listAdminContractExtractedFields: vi.fn(),
  updateAdminContractExtractedFieldReview: vi.fn()
}));
const recordEnterpriseAuditEvent = vi.fn();

vi.mock("@/lib/contract-intelligence/repositories/admin-extraction-repository", () => repo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => ({
  recordEnterpriseAuditEvent
}));

const run = {
  id: "run-1",
  organization_id: "org-1",
  contract_id: "contract-1",
  contract_file_id: "file-1",
  provider: "python_intelligence",
  status: "queued",
  extraction_mode: "deterministic_scaffold",
  requested_by_user_id: "user-1",
  started_at: null,
  completed_at: null,
  failed_at: null,
  safe_error_message: null,
  created_at: "2030-01-01T00:00:00.000Z",
  updated_at: "2030-01-01T00:00:00.000Z"
};

describe("contract extraction runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    repo.insertAdminContractExtractionRun.mockResolvedValue({ data: run, error: null });
    repo.insertAdminContractExtractedFields.mockResolvedValue({ data: [], error: null });
    repo.updateAdminContractExtractionRun.mockResolvedValue({
      data: { ...run, status: "completed" },
      error: null
    });
  });

  it("requests extraction as evidence and writes safe audit metadata", async () => {
    const { requestContractExtraction } = await import("@/lib/contract-intelligence/extraction-runs");

    const result = await requestContractExtraction({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1",
      requestedByUserId: "user-1"
    });

    expect(result).toEqual(run);
    expect(repo.insertAdminContractExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1",
        contractFileId: "file-1",
        extractionMode: "deterministic_scaffold"
      })
    );
    expect(recordEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "contract_extraction.requested",
        eventCategory: "evidence",
        metadata: expect.not.objectContaining({
          rawText: expect.anything(),
          providerPayload: expect.anything()
        })
      })
    );
  });

  it("records extraction results as pending evidence fields with citations", async () => {
    const { recordContractExtractionResult } = await import("@/lib/contract-intelligence/extraction-runs");

    await recordContractExtractionResult({
      organizationId: "org-1",
      contractId: "contract-1",
      extractionRunId: "run-1",
      actorUserId: "user-1",
      result: {
        provider: "python_intelligence",
        extractionMode: "deterministic_scaffold",
        overallConfidence: 0.82,
        warnings: ["deterministic_scaffold_no_ai_provider_called"],
        fields: [
          {
            fieldKey: "auto_renewal",
            extractedValue: true,
            normalizedValue: true,
            confidence: 0.86,
            citations: [{ sourceFileId: "file-1", page: 1, snippet: "Contract renews automatically." }],
            warningCodes: []
          }
        ]
      }
    });

    expect(repo.insertAdminContractExtractedFields).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        fields: [
          expect.objectContaining({
            field_key: "auto_renewal",
            evidence_status: undefined,
            source_snippet: "Contract renews automatically."
          })
        ]
      })
    );
    expect(repo.updateAdminContractExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "completed" })
      })
    );
  });
});
