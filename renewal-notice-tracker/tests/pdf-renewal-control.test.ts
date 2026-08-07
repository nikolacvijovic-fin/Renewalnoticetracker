import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyManualPdfRenewalCorrections,
  buildPdfRenewalReviewReasons,
  normalizePdfRenewalEvidenceSnippets,
  preparePdfRenewalExtractionForReview
} from "@/lib/contracts/pdf-renewal-control";
import { computeNeedsReview, uploadContractSchema, type ExtractedContractFields } from "@/lib/validation/contract";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function extracted(overrides: Partial<ExtractedContractFields> = {}): ExtractedContractFields {
  return {
    contract_title: "Acme Cloud MSA",
    counterparty_name: "Acme",
    contract_type: "MSA",
    effective_date: "2026-01-01",
    renewal_date: "2026-12-31",
    expiration_date: "2026-12-31",
    auto_renewal: true,
    renewal_term: "12 months",
    notice_period_value: 30,
    notice_period_unit: "days",
    notice_deadline_date: "2026-12-01",
    termination_window: "30 days",
    governing_law: null,
    payment_terms: null,
    contract_value_amount: 50000,
    contract_value_currency: "USD",
    contract_value_period: null,
    price_change_trigger: null,
    payment_trigger: null,
    financial_data_trust_status: "medium",
    extracted_clauses: [],
    field_confidence: {
      notice_deadline_date: 0.9,
      renewal_date: 0.9,
      expiration_date: 0.9,
      auto_renewal: 0.9,
      contract_value_amount: 0.9,
      contract_value_currency: 0.9
    },
    field_source_snippets: {
      notice_deadline_date: "Notice must be given by 2026-12-01.",
      renewal_date: "The contract renews on 2026-12-31.",
      expiration_date: "The term expires on 2026-12-31.",
      auto_renewal: "The subscription renews automatically.",
      contract_value_amount: "Annual fees are USD 50,000.",
      contract_value_currency: "Fees are denominated in USD."
    },
    reminder_recommendations: [],
    reviewer_notes: null,
    ...overrides
  };
}

describe("PDF Renewal Control MVP foundation", () => {
  it("accepts contract PDFs and rejects unsupported file types clearly", () => {
    expect(uploadContractSchema.parse({
      contractTitle: "Acme MSA",
      fileName: "acme.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024
    }).mimeType).toBe("application/pdf");

    expect(() => uploadContractSchema.parse({
      contractTitle: "Acme MSA",
      fileName: "image.png",
      mimeType: "image/png",
      sizeBytes: 1024
    })).toThrow("Unsupported file type. Upload a contract PDF or DOCX.");
  });

  it("marks weak or missing critical extracted fields as needs_review", () => {
    const prepared = preparePdfRenewalExtractionForReview({
      ...extracted({
        notice_deadline_date: null,
        field_confidence: {
          ...extracted().field_confidence,
          renewal_date: 0.61
        },
        field_source_snippets: {
          renewal_date: "The term may renew at the end of the current period."
        }
      }),
      needs_review: false
    });

    expect(prepared.needs_review).toBe(true);
    expect(prepared.pdf_renewal_review_reasons).toEqual(expect.arrayContaining([
      "missing_notice_deadline",
      "weak_evidence",
      "manual_review_required"
    ]));
    expect(computeNeedsReview(prepared)).toBe(true);
  });

  it("allows strong extracted critical fields to avoid automatic review flags", () => {
    const metadata = extracted();

    expect(buildPdfRenewalReviewReasons(metadata)).toEqual([]);
    expect(computeNeedsReview(metadata)).toBe(false);
  });

  it("marks inferred notice deadlines and conflicting dates for review", () => {
    const reasons = buildPdfRenewalReviewReasons(extracted({
      notice_deadline_date: "2027-01-15",
      renewal_date: "2026-12-31",
      field_source_snippets: {
        ...extracted().field_source_snippets,
        notice_deadline_date: ""
      }
    }));

    expect(reasons).toEqual(expect.arrayContaining([
      "inferred_from_notice_period",
      "conflicting_dates"
    ]));
  });

  it("keeps evidence snippets short, field-specific, and free of sensitive markers", () => {
    const snippets = normalizePdfRenewalEvidenceSnippets({
      notice_deadline_date: `${"Notice clause ".repeat(40)}deadline is 2026-12-01.`,
      renewal_date: "raw contract text with provider payload and secret token",
      auto_renewal: "The subscription renews automatically."
    });

    expect(snippets.notice_deadline_date).toBeDefined();
    expect(snippets.notice_deadline_date?.length).toBeLessThanOrEqual(240);
    expect(snippets.auto_renewal).toBe("The subscription renews automatically.");
    expect(snippets.renewal_date).toBeUndefined();
    expect(JSON.stringify(snippets)).not.toMatch(/raw contract|provider payload|secret token/i);
  });

  it("marks manual corrections to critical fields as reviewed trusted metadata", () => {
    const correction = applyManualPdfRenewalCorrections({
      previous: {
        notice_deadline_date: "2026-11-01",
        renewal_date: "2026-12-31",
        expiration_date: "2026-12-31",
        auto_renewal: true,
        contract_value_amount: 40000,
        contract_value_currency: "USD"
      },
      next: extracted({
        notice_deadline_date: "2026-12-01",
        renewal_date: "2026-12-31",
        contract_value_amount: 50000
      }),
      fieldConfidence: {
        notice_deadline_date: 0.4,
        renewal_date: 0.9,
        contract_value_amount: 0.5
      },
      fieldSourceSnippets: {},
      now: "2026-08-07T12:00:00.000Z"
    });

    expect(correction.correctedFields).toEqual(["notice_deadline_date", "contract_value_amount"]);
    expect(correction.fieldConfidence.notice_deadline_date).toBe(1);
    expect(correction.fieldConfidence.contract_value_amount).toBe(1);
    expect(correction.fieldConfidence.renewal_date).toBe(0.9);
    expect(correction.fieldSourceSnippets.notice_deadline_date).toContain("Manual correction reviewed");
  });

  it("keeps upload and review actions organization-scoped and audit-safe", () => {
    const legacy = readProjectFile("lib/actions/contracts/legacy.ts");
    const initialMigration = readProjectFile("supabase/migrations/202604050001_initial.sql");

    expect(legacy).toContain("requireShippedRuntimeAction(\"upload_import\")");
    expect(legacy).toContain("requireScopedContract(contractId, organizationId)");
    expect(legacy).toContain(".eq(\"organization_id\", organizationId)");
    expect(legacy).toContain("pdf_renewal_review_reasons");
    expect(legacy).not.toContain("rawContractText");
    expect(initialMigration).toContain("members can access contract files");
    expect(initialMigration).toContain("from public.contracts");
    expect(initialMigration).toContain("join public.memberships");
    expect(initialMigration).toContain("where contracts.id = contract_files.contract_id");
  });
});
