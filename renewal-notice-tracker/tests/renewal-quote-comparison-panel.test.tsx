import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RenewalQuoteComparisonPanel } from "@/components/contracts/renewal-quote-comparison-panel";

vi.mock("@/lib/actions/contracts", () => ({
  createAndRunQuoteComparisonFormAction: vi.fn(),
  createSavingsOpportunityFormAction: vi.fn(),
  dismissSavingsOpportunityFormAction: vi.fn(),
  reviewQuoteFindingFormAction: vi.fn()
}));

describe("RenewalQuoteComparisonPanel", () => {
  it("renders an empty evidence state", () => {
    render(
      <RenewalQuoteComparisonPanel
        contractId="contract-1"
        comparisons={[]}
        findings={[]}
        opportunities={[]}
        canReview={false}
      />
    );

    expect(screen.getByText("Renewal quote comparison")).toBeInTheDocument();
    expect(screen.getByText("No quote yet")).toBeInTheDocument();
    expect(screen.getByText(/No quote findings/)).toBeInTheDocument();
  });

  it("renders completed quote risk and savings opportunity evidence", () => {
    render(
      <RenewalQuoteComparisonPanel
        contractId="contract-1"
        canReview
        comparisons={[
          {
            id: "comparison-1",
            organization_id: "org-1",
            contract_id: "contract-1",
            quote_file_id: null,
            status: "completed",
            source: "manual",
            requested_by_user_id: "user-1",
            current_total_amount: 10000,
            proposed_total_amount: 12500,
            currency: "USD",
            price_delta_amount: 2500,
            price_delta_percent: 25,
            overall_risk_level: "critical",
            recommendation_summary: "Review quote findings before approving renewal.",
            safe_error_message: null,
            warning_codes: [],
            created_at: "2030-01-01T00:00:00.000Z",
            updated_at: "2030-01-01T00:00:00.000Z"
          }
        ]}
        findings={[
          {
            id: "finding-1",
            organization_id: "org-1",
            comparison_id: "comparison-1",
            contract_id: "contract-1",
            finding_type: "price_increase",
            severity: "critical",
            title: "Renewal quote increases total cost",
            description: "Review before approval.",
            current_value: { amount: 10000 },
            proposed_value: { amount: 12500 },
            delta_value: { amount: 2500, percent: 25 },
            confidence: 0.9,
            citation: null,
            status: "open",
            reviewed_by_user_id: null,
            reviewed_at: null,
            created_at: "2030-01-01T00:00:00.000Z"
          }
        ]}
        opportunities={[
          {
            id: "opportunity-1",
            organization_id: "org-1",
            contract_id: "contract-1",
            comparison_id: "comparison-1",
            opportunity_type: "price_increase",
            title: "Challenge renewal price increase",
            estimated_savings_amount: 2500,
            currency: "USD",
            confidence: 0.86,
            status: "open",
            owner_user_id: null,
            evidence: {},
            created_at: "2030-01-01T00:00:00.000Z",
            updated_at: "2030-01-01T00:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getAllByText("critical").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Renewal quote increases total cost")).toBeInTheDocument();
    expect(screen.getByText("Challenge renewal price increase")).toBeInTheDocument();
    expect(screen.getByText("Accept finding")).toBeInTheDocument();
  });

  it("renders failed comparison state with safe message", () => {
    render(
      <RenewalQuoteComparisonPanel
        contractId="contract-1"
        canReview={false}
        comparisons={[
          {
            id: "comparison-1",
            organization_id: "org-1",
            contract_id: "contract-1",
            quote_file_id: null,
            status: "failed",
            source: "manual",
            requested_by_user_id: "user-1",
            current_total_amount: null,
            proposed_total_amount: null,
            currency: null,
            price_delta_amount: null,
            price_delta_percent: null,
            overall_risk_level: "unknown",
            recommendation_summary: null,
            safe_error_message: "Add-on service URL is not configured.",
            warning_codes: ["not_configured"],
            created_at: "2030-01-01T00:00:00.000Z",
            updated_at: "2030-01-01T00:00:00.000Z"
          }
        ]}
        findings={[]}
        opportunities={[]}
      />
    );

    expect(screen.getByText("Add-on service URL is not configured.")).toBeInTheDocument();
  });
});
