import { describe, expect, it } from "vitest";
import { applyOcrReviewRequirements, normalizeOcrOutput } from "@/lib/ocr/normalize-ocr-output";

describe("OCR normalization and trust handling", () => {
  it("normalizes OCR output text and confidence", () => {
    const normalized = normalizeOcrOutput({
      status: "completed",
      provider: "mock",
      processingMode: "sync",
      text: "Notice    deadline",
      averageConfidence: 0.72,
      estimatedCost: 0,
      pages: [
        {
          pageNumber: 1,
          text: "Notice    deadline",
          confidence: 0.72,
          lines: []
        }
      ]
    });

    expect(normalized.text).toBe("Notice\n\ndeadline");
    expect(normalized.averageConfidence).toBe(0.72);
  });

  it("forces OCR-derived metadata back into review and caps confidence", () => {
    const metadata = applyOcrReviewRequirements(
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        contract_type: "MSA",
        effective_date: "2030-01-01",
        renewal_date: "2030-12-31",
        expiration_date: "2030-12-31",
        auto_renewal: true,
        renewal_term: "12 months",
        notice_period_value: 30,
        notice_period_unit: "days",
        notice_deadline_date: "2030-11-30",
        termination_window: "30 days",
        governing_law: "Serbia",
        payment_terms: "Net 30",
        contract_value_amount: null,
        contract_value_currency: null,
        contract_value_period: null,
        price_change_trigger: null,
        payment_trigger: null,
        financial_data_trust_status: null,
        extracted_clauses: [],
        field_confidence: { expiration_date: 0.9 },
        field_source_snippets: { expiration_date: "Termination date shown on scanned page." },
        reminder_recommendations: [],
        reviewer_notes: null,
        needs_review: false
      },
      { provider: "mock", averageConfidence: 0.55, reason: "native extraction returned no usable text" }
    );

    expect(metadata.needs_review).toBe(true);
    expect(metadata.field_confidence.expiration_date).toBe(0.65);
    expect(metadata.field_source_snippets.expiration_date).toContain("[OCR]");
    expect(metadata.reviewer_notes).toContain("OCR fallback");
  });
});
