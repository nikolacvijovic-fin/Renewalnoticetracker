import { describe, expect, it } from "vitest";
import { reviewContractSchema } from "@/lib/validation/contract";

const basePayload = {
  contract_title: "MSA",
  counterparty_name: "Acme",
  contract_type: "MSA",
  effective_date: null,
  expiration_date: null,
  auto_renewal: null,
  renewal_term: null,
  notice_period_value: null,
  notice_period_unit: null,
  notice_deadline_date: null,
  governing_law: null,
  payment_terms: null,
  extracted_clauses: [],
  field_confidence: {},
  field_source_snippets: {},
  reminder_recommendations: [],
  reviewer_notes: null,
  needs_review: false,
  review_mode: "exception_review" as const,
  review_reason: "Manual review required."
};

describe("review contract validation", () => {
  it("blocks review completion when no actionable date exists", () => {
    expect(() => reviewContractSchema.parse(basePayload)).toThrow();
  });

  it("allows review completion when an expiration date exists", () => {
    expect(
      reviewContractSchema.parse({
        ...basePayload,
        expiration_date: "2026-12-31",
        review_reason: "Confirmed from the source clause."
      }).expiration_date
    ).toBe("2026-12-31");
  });

  it("rejects Fast Review when any dirty flag is present", () => {
    expect(() =>
      reviewContractSchema.parse({
        ...basePayload,
        expiration_date: "2026-12-31",
        review_mode: "fast_review",
        has_conflict: true
      })
    ).toThrow("Fast Review is only allowed when no dirty review flags are present.");
  });

  it("rejects exception review without a typed reason", () => {
    expect(() =>
      reviewContractSchema.parse({
        ...basePayload,
        expiration_date: "2026-12-31",
        review_reason: null,
        is_ocr_assisted: true
      })
    ).toThrow("Exception review requires a typed reason so reminder trust changes are auditable.");
  });
});
