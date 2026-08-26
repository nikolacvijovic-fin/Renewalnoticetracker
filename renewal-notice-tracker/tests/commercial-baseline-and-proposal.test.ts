import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { buildCommercialBaselineFromReviewedEvidence } from "@/lib/quote-comparison/commercial-baseline";
import {
  classifyCommercialProposalDocument,
  parseCommercialProposalSpreadsheet
} from "@/lib/quote-comparison/proposal-ingestion";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";

function field(input: Partial<ContractExtractedField> & Pick<ContractExtractedField, "id" | "field_key" | "normalized_value">): ContractExtractedField {
  return {
    organization_id: "org-1", contract_id: "contract-1", extraction_run_id: "run-1",
    extracted_value: input.normalized_value ?? "", confidence: 1, evidence_status: "accepted",
    source_file_id: "contract-file-1", source_page: 1, source_snippet: "short cited evidence",
    source_offsets: null, edited_value: null, override_reason: null, warning_codes: [],
    reviewed_by_user_id: "reviewer-1", reviewed_at: "2026-08-25T00:00:00.000Z",
    applied_to_contract_at: null, rejected_at: null, rejection_reason: null,
    created_at: "2026-08-25T00:00:00.000Z", ...input
  };
}

describe("commercial baseline and proposal ingestion", () => {
  it("builds a baseline only from accepted evidence and records missing-data warnings", () => {
    const draft = buildCommercialBaselineFromReviewedEvidence({
      contractId: "contract-1", reviewerUserId: "reviewer-1",
      fields: [
        field({ id: "amount", field_key: "committed_annual_cost", normalized_value: 120_000 }),
        field({ id: "currency", field_key: "contract_value_currency", normalized_value: "EUR" }),
        field({ id: "product", field_key: "products", normalized_value: "Platform subscription" })
      ]
    });
    expect(draft.sourceExtractionRunId).toBe("run-1");
    expect(draft.evidenceFieldIds).toEqual(["amount", "currency", "product"]);
    expect(draft.terms.lineItems[0]).toMatchObject({ totalAmount: 120_000, currency: "EUR" });
    expect(draft.completenessStatus).toBe("partial");
    expect(draft.missingDataWarnings).toContain("missing_reviewed_notice_deadline");
  });

  it("rejects superseded evidence and applies reviewed amendment precedence across extraction versions", () => {
    expect(() => buildCommercialBaselineFromReviewedEvidence({
      contractId: "contract-1", reviewerUserId: "reviewer-1",
      fields: [field({ id: "old", field_key: "committed_annual_cost", normalized_value: 120_000, evidence_status: "superseded" })]
    })).toThrow("accepted_commercial_evidence_required");
    const draft = buildCommercialBaselineFromReviewedEvidence({
      contractId: "contract-1", reviewerUserId: "reviewer-1",
      fields: [
        field({ id: "base-amount", field_key: "committed_annual_cost", normalized_value: 120_000, source_file_id: "base-file" }),
        field({ id: "amended-amount", field_key: "committed_annual_cost", normalized_value: 150_000, extraction_run_id: "run-2", source_file_id: "amendment-file" }),
        field({ id: "currency", field_key: "contract_value_currency", normalized_value: "EUR", source_file_id: "base-file" })
      ],
      relationships: [{
        id: "relationship-1", organization_id: "org-1", contract_id: "contract-1",
        source_file_id: "amendment-file", target_file_id: "base-file", relationship_type: "amends",
        effective_date: "2026-08-01", confidence: 1, evidence_status: "accepted", evidence_field_ids: ["amended-amount"],
        reviewed_by_user_id: "reviewer-1", reviewed_at: "2026-08-25T00:00:00.000Z", created_at: "2026-08-25T00:00:00.000Z"
      }]
    });
    expect(draft.terms.statedAnnualTotal).toBe(150_000);
    expect(draft.sourceExtractionRunIds.sort()).toEqual(["run-1", "run-2"]);
  });

  it("extracts proposal spreadsheet line items with cell-level citations", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["product_name", "sku", "quantity", "unit_price", "total_amount", "currency", "billing_period", "discount_percent"],
      ["Platform seats", "SEAT", 110, 112, 12320, "EUR", "monthly", 0]
    ]), "Renewal Quote");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const result = parseCommercialProposalSpreadsheet({
      fileId: "quote-file-1", buffer, fileName: "2027 renewal quote.xlsx", extractionRunId: "quote-run-1"
    });
    expect(result.documentType).toBe("renewal_quote");
    expect(result.requiresReview).toBe(true);
    expect(result.terms.lineItems[0]).toMatchObject({ productName: "Platform seats", quantity: 110, unitPrice: 112, currency: "EUR" });
    expect(result.terms.lineItems[0]?.evidence.some((item) => item.cell === "Renewal Quote!A2")).toBe(true);
  });

  it("classifies supported commercial document types without treating unknown files as contracts", () => {
    expect(classifyCommercialProposalDocument({ fileName: "renewal-quote.pdf" })).toBe("renewal_quote");
    expect(classifyCommercialProposalDocument({ fileName: "amendment.docx" })).toBe("amendment");
    expect(classifyCommercialProposalDocument({ fileName: "notes.pdf" })).toBe("unknown_commercial_document");
  });
});
