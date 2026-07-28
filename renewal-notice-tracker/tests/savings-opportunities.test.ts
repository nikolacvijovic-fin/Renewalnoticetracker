import { describe, expect, it } from "vitest";
import { buildSavingsOpportunityFromFinding } from "@/lib/quote-comparison/savings-opportunities";

describe("savings opportunities", () => {
  it("creates savings opportunities from commercial quote findings", () => {
    const opportunity = buildSavingsOpportunityFromFinding({
      finding: {
        findingType: "price_increase",
        severity: "high",
        title: "Renewal quote increases total cost",
        description: "Review before approval.",
        deltaValue: { amount: 2500, percent: 25 },
        confidence: 0.9,
        citation: { snippet: "Quote total USD 12,500." }
      },
      currency: "USD",
      priceDeltaAmount: 2500
    });

    expect(opportunity).toEqual(
      expect.objectContaining({
        opportunityType: "price_increase",
        title: "Challenge renewal price increase",
        estimatedSavingsAmount: 2500,
        currency: "USD"
      })
    );
  });

  it("does not create savings opportunities for non-commercial warnings", () => {
    expect(
      buildSavingsOpportunityFromFinding({
        finding: {
          findingType: "notice_window_risk",
          severity: "high",
          title: "Missing notice window",
          description: "Review deadline.",
          confidence: 0.76
        }
      })
    ).toBeNull();
  });

  it("keeps opportunity evidence bounded and free of raw payloads", () => {
    const opportunity = buildSavingsOpportunityFromFinding({
      finding: {
        findingType: "discount_removed",
        severity: "high",
        title: "Discount removed",
        description: "Review discount.",
        confidence: 0.8,
        deltaValue: { removedDiscounts: ["enterprise discount"], providerPayload: "raw payload" },
        citation: { snippet: "discount removed" }
      }
    });

    expect(JSON.stringify(opportunity?.evidence)).not.toMatch(/raw payload/i);
    expect(opportunity?.evidence).toEqual(
      expect.objectContaining({
        findingType: "discount_removed",
        severity: "high"
      })
    );
  });
});
