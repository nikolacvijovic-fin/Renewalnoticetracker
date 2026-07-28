import { describe, expect, it } from "vitest";
import { computePriceDelta, sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import { classifyQuoteRisk, compareRenewalQuoteToContract } from "@/lib/quote-comparison/quote-findings";

describe("renewal quote comparison", () => {
  it("computes price deltas without inventing percentages when baseline is missing", () => {
    expect(computePriceDelta(100, 125)).toEqual({
      priceDeltaAmount: 25,
      priceDeltaPercent: 25
    });
    expect(computePriceDelta(null, 125)).toEqual({
      priceDeltaAmount: null,
      priceDeltaPercent: null
    });
  });

  it("classifies material price increases as high or critical risk", () => {
    expect(classifyQuoteRisk({ priceDeltaPercent: 8 })).toBe("medium");
    expect(classifyQuoteRisk({ priceDeltaPercent: 18 })).toBe("high");
    expect(classifyQuoteRisk({ priceDeltaPercent: 27 })).toBe("critical");
  });

  it("returns evidence findings for price increases without making trusted decisions", () => {
    const result = compareRenewalQuoteToContract({
      currentTerms: { total_amount: 10000, currency: "USD" },
      proposedTerms: { total_amount: 12500, currency: "USD" },
      citationSnippet: "Renewal quote total USD 12,500."
    });

    expect(result.priceDeltaAmount).toBe(2500);
    expect(result.priceDeltaPercent).toBe(25);
    expect(result.overallRiskLevel).toBe("critical");
    expect(result.findings).toEqual([
      expect.objectContaining({
        findingType: "price_increase",
        severity: "critical",
        confidence: 0.9
      })
    ]);
    expect(result.recommendationSummary).toMatch(/Review quote findings/);
  });

  it("recursively strips raw customer and provider data from evidence", () => {
    const sanitized = sanitizeQuoteEvidence({
      safeCount: 1,
      nested: {
        raw_quote_text: "raw quote text should not survive",
        token: "secret-token",
        safeStatus: "open"
      },
      rows: [{ providerPayload: "raw provider payload" }, { id: "safe-id" }]
    });

    expect(JSON.stringify(sanitized)).not.toMatch(/raw quote|secret-token|provider payload/i);
    expect(sanitized).toEqual({
      safeCount: 1,
      nested: { safeStatus: "open" },
      rows: [{}, { id: "safe-id" }]
    });
  });
});
