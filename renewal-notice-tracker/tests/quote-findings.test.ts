import { describe, expect, it } from "vitest";
import { compareRenewalQuoteToContract } from "@/lib/quote-comparison/quote-findings";

describe("renewal quote findings", () => {
  it("detects removed discounts", () => {
    const result = compareRenewalQuoteToContract({
      currentTerms: { discounts: ["20% enterprise discount"] },
      proposedTerms: { discounts: [] }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        findingType: "discount_removed",
        severity: "high"
      })
    ]);
  });

  it("detects payment term changes", () => {
    const result = compareRenewalQuoteToContract({
      currentTerms: { payment_terms: "Net 60" },
      proposedTerms: { payment_terms: "Annual prepaid" }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        findingType: "payment_terms_changed",
        currentValue: "Net 60",
        proposedValue: "Annual prepaid"
      })
    ]);
  });

  it("detects renewal term changes", () => {
    const result = compareRenewalQuoteToContract({
      currentTerms: { renewal_term: "12 months" },
      proposedTerms: { renewal_term: "36 months" }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        findingType: "renewal_term_changed",
        severity: "medium"
      })
    ]);
  });

  it("detects missing notice-window evidence when auto-renewal appears in the quote", () => {
    const result = compareRenewalQuoteToContract({
      currentTerms: {},
      proposedTerms: { auto_renewal: true }
    });

    expect(result.findings).toEqual([
      expect.objectContaining({
        findingType: "notice_window_risk",
        severity: "high"
      })
    ]);
  });
});
