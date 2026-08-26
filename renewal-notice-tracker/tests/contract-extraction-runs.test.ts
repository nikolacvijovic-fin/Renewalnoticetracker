import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  insertAdminContractExtractionRun: vi.fn(),
  updateAdminContractExtractionRun: vi.fn(),
  insertAdminContractExtractedFields: vi.fn(),
  listAdminContractExtractionRuns: vi.fn(),
  listAdminContractExtractedFields: vi.fn(),
  listAdminContractDocumentRelationships: vi.fn(),
  updateAdminContractExtractedFieldReview: vi.fn(),
  supersedeAdminAcceptedExtractedFields: vi.fn(),
  replaceAdminCommercialAnalysis: vi.fn(),
  getAdminOrganizationTimezone: vi.fn(),
  getAdminContractExtractionRunByIdempotency: vi.fn()
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
  provider: "openai",
  status: "queued",
  extraction_mode: "provider_backed",
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
    repo.supersedeAdminAcceptedExtractedFields.mockResolvedValue({ data: [], error: null });
    repo.replaceAdminCommercialAnalysis.mockResolvedValue({ error: null });
    repo.getAdminOrganizationTimezone.mockResolvedValue({ data: { timezone: "UTC" }, error: null });
    repo.listAdminContractExtractedFields.mockResolvedValue({ data: [], error: null });
    repo.listAdminContractDocumentRelationships.mockResolvedValue({ data: [], error: null });
    repo.getAdminContractExtractionRunByIdempotency.mockResolvedValue({ data: null, error: null });
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
        extractionMode: "provider_backed"
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
        provider: "openai",
        extractionMode: "provider_backed",
        overallConfidence: 0.82,
        warnings: [],
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
            source_snippet: "Contract renews automatically."
          })
        ]
      })
    );
    const insertedFields = repo.insertAdminContractExtractedFields.mock.calls[0]?.[0].fields ?? [];
    expect(insertedFields[0]?.evidence_status).toBeUndefined();
    expect(repo.updateAdminContractExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "completed" })
      })
    );
  });

  it("accepts one candidate, supersedes prior accepted evidence, and refreshes reviewed analysis", async () => {
    const reviewedField = {
      id: "field-1",
      organization_id: "org-1",
      contract_id: "contract-1",
      extraction_run_id: "run-1",
      field_key: "renewal_date",
      extracted_value: "2030-12-31",
      normalized_value: "2030-12-31",
      confidence: 0.91,
      evidence_status: "accepted",
      source_file_id: "file-1",
      source_page: 3,
      source_snippet: "The term renews on 2030-12-31.",
      source_offsets: null,
      warning_codes: [],
      reviewed_by_user_id: "user-1",
      reviewed_at: "2030-01-01T00:00:00.000Z",
      applied_to_contract_at: null,
      rejected_at: null,
      rejection_reason: null,
      created_at: "2030-01-01T00:00:00.000Z"
    };
    repo.updateAdminContractExtractedFieldReview.mockResolvedValue({ data: reviewedField, error: null });
    repo.listAdminContractExtractedFields.mockResolvedValue({ data: [reviewedField], error: null });
    const { reviewExtractedField } = await import("@/lib/contract-intelligence/extraction-runs");
    await reviewExtractedField({
      organizationId: "org-1",
      contractId: "contract-1",
      fieldId: "field-1",
      reviewerUserId: "user-1"
    });
    expect(repo.updateAdminContractExtractedFieldReview).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      contractId: "contract-1",
      fieldId: "field-1"
    }));
    expect(repo.supersedeAdminAcceptedExtractedFields).toHaveBeenCalledWith(expect.objectContaining({
      fieldKey: "renewal_date",
      exceptFieldId: "field-1"
    }));
    expect(repo.replaceAdminCommercialAnalysis).toHaveBeenCalled();
  });

  it("records overrides without placing edited values or sensitive reasons in audit metadata", async () => {
    const reviewedField = {
      id: "field-2",
      organization_id: "org-1",
      contract_id: "contract-1",
      extraction_run_id: "run-1",
      field_key: "contract_value_amount",
      extracted_value: 100,
      normalized_value: 100,
      confidence: 0.7,
      evidence_status: "accepted",
      source_file_id: "file-1",
      source_page: 4,
      source_snippet: "Fees are USD 100.",
      source_offsets: null,
      warning_codes: [],
      reviewed_by_user_id: "user-1",
      reviewed_at: "2030-01-01T00:00:00.000Z",
      applied_to_contract_at: null,
      rejected_at: null,
      rejection_reason: null,
      created_at: "2030-01-01T00:00:00.000Z"
    };
    repo.updateAdminContractExtractedFieldReview.mockResolvedValue({ data: reviewedField, error: null });
    repo.listAdminContractExtractedFields.mockResolvedValue({ data: [reviewedField], error: null });
    const { editExtractedField } = await import("@/lib/contract-intelligence/extraction-runs");
    await editExtractedField({
      organizationId: "org-1",
      contractId: "contract-1",
      fieldId: "field-2",
      reviewerUserId: "user-1",
      editedValue: 120,
      reason: "raw contract text provider payload secret"
    });
    const overrideAudit = recordEnterpriseAuditEvent.mock.calls.find(
      ([event]) => event.eventType === "contract_extracted_field.overridden"
    )?.[0];
    expect(overrideAudit?.metadata).toMatchObject({ overrideReasonCode: "human_review_override" });
    expect(JSON.stringify(overrideAudit)).not.toContain("raw contract text");
    expect(JSON.stringify(overrideAudit)).not.toContain("120");
  });
});
