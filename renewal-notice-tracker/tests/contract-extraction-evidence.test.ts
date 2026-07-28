import { describe, expect, it } from "vitest";
import {
  computeExtractionEvidenceConfidence,
  mapExtractedFieldsToContractMetadataPatch,
  sanitizeExtractionSourceSnippet
} from "@/lib/contract-intelligence/extraction-evidence";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";

function field(overrides: Partial<ContractExtractedField> = {}): ContractExtractedField {
  return {
    id: "field-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    extraction_run_id: "run-1",
    field_key: "notice_deadline_date",
    extracted_value: "2030-05-01",
    normalized_value: "2030-05-01",
    confidence: 0.91,
    evidence_status: "accepted",
    source_file_id: "file-1",
    source_page: 1,
    source_snippet: "Notice must be provided by 2030-05-01.",
    source_offsets: null,
    warning_codes: [],
    reviewed_by_user_id: "reviewer-1",
    reviewed_at: "2030-01-01T00:00:00.000Z",
    applied_to_contract_at: null,
    rejected_at: null,
    rejection_reason: null,
    created_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("contract extraction evidence", () => {
  it("redacts sensitive source snippets instead of storing raw contract markers", () => {
    expect(sanitizeExtractionSourceSnippet("raw contract text with token abc")).toBe(
      "Evidence snippet redacted because it contained sensitive raw content markers."
    );
  });

  it("penalizes missing citation evidence for critical fields", () => {
    const confidence = computeExtractionEvidenceConfidence([
      {
        confidence: 0.9,
        citations: [],
        warningCodes: []
      }
    ]);

    expect(confidence).toBeLessThan(0.9);
  });

  it("maps only accepted extraction fields into metadata and keeps review required", () => {
    const patch = mapExtractedFieldsToContractMetadataPatch({
      fields: [
        field(),
        field({
          id: "field-2",
          field_key: "renewal_date",
          normalized_value: "2030-06-30",
          evidence_status: "rejected"
        })
      ],
      existingFieldConfidence: {},
      existingFieldSourceSnippets: {},
      now: "2030-01-01T00:00:00.000Z"
    });

    expect(patch.notice_deadline_date).toBe("2030-05-01");
    expect(patch.renewal_date).toBeUndefined();
    expect(patch.needs_review).toBe(true);
    expect(patch.has_weak_evidence).toBe(false);
    expect(patch.field_confidence.notice_deadline_date).toBe(0.91);
  });

  it("keeps weak evidence flagged even when a reviewer accepts a low-confidence field", () => {
    const patch = mapExtractedFieldsToContractMetadataPatch({
      fields: [field({ confidence: 0.62 })],
      existingFieldConfidence: {},
      existingFieldSourceSnippets: {}
    });

    expect(patch.has_weak_evidence).toBe(true);
    expect(patch.needs_review).toBe(true);
  });
});
