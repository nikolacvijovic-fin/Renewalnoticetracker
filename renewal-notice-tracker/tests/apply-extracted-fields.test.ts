import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getAdminContractMetadataForPatch: vi.fn(),
  listAdminContractExtractedFields: vi.fn(),
  updateAdminContractMetadataFromExtraction: vi.fn(),
  markAdminExtractedFieldsApplied: vi.fn()
}));
const recordEnterpriseAuditEvent = vi.fn();

vi.mock("@/lib/contract-intelligence/repositories/admin-extraction-repository", () => repo);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => ({
  recordEnterpriseAuditEvent
}));

describe("apply accepted extraction fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    repo.getAdminContractMetadataForPatch.mockResolvedValue({
      data: { id: "metadata-1", field_confidence: {}, field_source_snippets: {} },
      error: null
    });
    repo.updateAdminContractMetadataFromExtraction.mockResolvedValue({
      data: { id: "metadata-1" },
      error: null
    });
    repo.markAdminExtractedFieldsApplied.mockResolvedValue({ data: [], error: null });
  });

  it("applies only accepted org-scoped fields and keeps metadata in review", async () => {
    repo.listAdminContractExtractedFields.mockResolvedValue({
      data: [
        {
          id: "field-1",
          organization_id: "org-1",
          contract_id: "contract-1",
          extraction_run_id: "run-1",
          field_key: "notice_deadline_date",
          extracted_value: "2030-05-01",
          normalized_value: "2030-05-01",
          confidence: 0.9,
          evidence_status: "accepted",
          source_file_id: "file-1",
          source_page: 1,
          source_snippet: "Notice deadline is 2030-05-01.",
          source_offsets: null,
          warning_codes: [],
          reviewed_by_user_id: "reviewer-1",
          reviewed_at: "2030-01-01T00:00:00.000Z",
          applied_to_contract_at: null,
          rejected_at: null,
          rejection_reason: null,
          created_at: "2030-01-01T00:00:00.000Z"
        }
      ],
      error: null
    });
    const { applyAcceptedFieldsToContractMetadata } = await import(
      "@/lib/contract-intelligence/apply-extracted-fields"
    );

    const result = await applyAcceptedFieldsToContractMetadata({
      organizationId: "org-1",
      contractId: "contract-1",
      reviewerUserId: "reviewer-1"
    });

    expect(result.metadataPatch.notice_deadline_date).toBe("2030-05-01");
    expect(result.metadataPatch.needs_review).toBe(true);
    expect(repo.updateAdminContractMetadataFromExtraction).toHaveBeenCalledWith(
      expect.objectContaining({
        metadataId: "metadata-1",
        patch: expect.objectContaining({
          needs_review: true,
          field_confidence: expect.objectContaining({
            notice_deadline_date: 0.9
          })
        })
      })
    );
    expect(recordEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "contract_extracted_fields.applied_to_metadata",
        metadata: expect.objectContaining({
          fieldKeys: ["notice_deadline_date"],
          needsReview: true
        })
      })
    );
  });
});
