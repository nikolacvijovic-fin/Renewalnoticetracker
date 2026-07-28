import { beforeEach, describe, expect, it, vi } from "vitest";

const compareQuote = vi.fn();
const createRenewalQuoteComparison = vi.fn();
const recordQuoteComparisonFindings = vi.fn();
const failRenewalQuoteComparison = vi.fn();

vi.mock("@/lib/add-ons/python-intelligence-client", () => ({
  compareQuote
}));

vi.mock("@/lib/quote-comparison/quote-comparison", () => ({
  createRenewalQuoteComparison,
  recordQuoteComparisonFindings,
  failRenewalQuoteComparison
}));

describe("python quote comparison runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRenewalQuoteComparison.mockResolvedValue({
      id: "comparison-1",
      organization_id: "org-1",
      contract_id: "contract-1"
    });
    recordQuoteComparisonFindings.mockResolvedValue({
      comparison: { id: "comparison-1", status: "completed" },
      findings: [{ id: "finding-1" }]
    });
  });

  it("records Python quote findings as reviewable evidence", async () => {
    compareQuote.mockResolvedValue({
      ok: true,
      output: {
        current_total_amount: 100,
        proposed_total_amount: 125,
        currency: "USD",
        price_delta_amount: 25,
        price_delta_percent: 25,
        overall_risk_level: "critical",
        findings: [
          {
            finding_type: "price_increase",
            severity: "critical",
            title: "Renewal quote increases total cost",
            description: "Review before approval.",
            current_value: { amount: 100 },
            proposed_value: { amount: 125 },
            delta_value: { amount: 25, percent: 25 },
            confidence: 0.9,
            citation: { snippet: "Quote total USD 125." }
          }
        ],
        savings_opportunities: [],
        recommendation_summary: "Review quote findings before approving renewal.",
        warnings: ["deterministic_scaffold_no_provider_backed_ai"]
      }
    });
    const { runPythonRenewalQuoteComparison } = await import(
      "@/lib/quote-comparison/python-quote-comparison-runner"
    );

    const result = await runPythonRenewalQuoteComparison({
      organizationId: "org-1",
      contractId: "contract-1",
      requestedByUserId: "user-1",
      currentTerms: { price: 100 },
      proposedTerms: { price: 125 },
      quoteText: "raw quote body should not be stored by runner"
    });

    expect(result.ok).toBe(true);
    expect(recordQuoteComparisonFindings).toHaveBeenCalledWith(
      expect.objectContaining({
        comparisonId: "comparison-1",
        result: expect.objectContaining({
          priceDeltaPercent: 25,
          findings: [
            expect.objectContaining({
              findingType: "price_increase",
              severity: "critical"
            })
          ]
        })
      })
    );
  });

  it("marks comparison failed safely when Python comparison is not configured", async () => {
    compareQuote.mockResolvedValue({
      ok: false,
      errorCode: "not_configured",
      safeMessage: "Add-on service URL is not configured."
    });
    const { runPythonRenewalQuoteComparison } = await import(
      "@/lib/quote-comparison/python-quote-comparison-runner"
    );

    const result = await runPythonRenewalQuoteComparison({
      organizationId: "org-1",
      contractId: "contract-1",
      requestedByUserId: "user-1",
      currentTerms: { price: 100 },
      proposedTerms: { price: 125 }
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        comparisonId: "comparison-1",
        errorCode: "not_configured"
      })
    );
    expect(failRenewalQuoteComparison).toHaveBeenCalledWith(
      expect.objectContaining({
        comparisonId: "comparison-1",
        safeErrorMessage: "Add-on service URL is not configured."
      })
    );
    expect(recordQuoteComparisonFindings).not.toHaveBeenCalled();
  });
});
