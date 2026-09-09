import { describe, expect, it } from "vitest";
import { pdfUploadAttemptResultFromRow } from "@/lib/contracts/pdf-upload-attempts";

const baseRow = {
  id: "contract-1",
  organization_id: "organization-1",
  status: "needs_review",
  latest_file_id: "file-1",
  pdf_upload_attempt_id: "11111111-1111-4111-8111-111111111111",
  pdf_upload_attempt_status: "needs_review",
  pdf_upload_claimed_at: "2026-09-09T10:00:00.000Z",
  pdf_extraction_job_id: "job-1",
  contract_files: [{
    id: "file-1",
    file_name: "Acme Renewal Agreement.pdf",
    size_bytes: 4096,
    storage_deleted_at: null
  }],
  contract_metadata: {
    needs_review: true,
    pdf_renewal_review_reasons: ["weak_evidence", "manual_review_required"]
  }
};

describe("PDF upload attempt recovery", () => {
  it("returns persisted safe file metadata and structured review reasons", () => {
    expect(pdfUploadAttemptResultFromRow({
      row: baseRow,
      uploadAttemptId: baseRow.pdf_upload_attempt_id,
      recovered: true
    })).toMatchObject({
      ok: true,
      fileName: "Acme Renewal Agreement.pdf",
      fileSize: 4096,
      reviewReasons: ["weak_evidence", "manual_review_required"],
      recovered: true
    });
  });

  it("never returns metadata for a storage-deleted file", () => {
    expect(pdfUploadAttemptResultFromRow({
      row: {
        ...baseRow,
        contract_files: [{
          id: "file-1",
          file_name: "Acme Renewal Agreement.pdf",
          size_bytes: 4096,
          storage_deleted_at: "2026-09-09T12:00:00.000Z"
        }]
      },
      uploadAttemptId: baseRow.pdf_upload_attempt_id,
      recovered: true
    })).toMatchObject({
      ok: true,
      fileName: undefined,
      fileSize: undefined
    });
  });
});
