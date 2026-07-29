import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RevenueCommandCenter } from "@/components/revenue-intelligence/revenue-command-center";
import type { RevenueIntelligenceDashboard } from "@/lib/revenue-intelligence/revenue-types";

vi.mock("@/lib/actions/revenue-intelligence", () => ({
  archiveRevenueSignalFormAction: vi.fn(),
  enqueueRevenueIntelligenceRefreshJobFormAction: vi.fn(),
  generateRevenueIntelligenceSnapshotFormAction: vi.fn(),
  markExecutiveInsightReviewedFormAction: vi.fn()
}));

afterEach(() => cleanup());

function dashboard(overrides: Partial<RevenueIntelligenceDashboard> = {}): RevenueIntelligenceDashboard {
  const signal = {
    id: "signal-1",
    organization_id: "org-1",
    snapshot_id: "snapshot-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    quote_comparison_id: null,
    savings_opportunity_id: null,
    negotiation_brief_id: null,
    outreach_opportunity_id: null,
    signal_type: "decision_blocked" as const,
    severity: "critical" as const,
    title: "Commercial decision is blocked",
    summary: "Decision blockers require leadership review.",
    vendor_name: "Vendor A",
    category_name: "SaaS",
    amount: 120000,
    currency: "USD",
    evidence_confidence: 0.91,
    source_module: "revenue_intelligence",
    source_fingerprint: "signal-1",
    status: "active" as const,
    warning_codes: ["missing_approver"],
    created_by_user_id: "user-1",
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  };
  const evidence = {
    id: "evidence-1",
    organization_id: "org-1",
    snapshot_id: "snapshot-1",
    signal_id: null,
    metric_id: null,
    insight_id: null,
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    quote_comparison_id: null,
    savings_opportunity_id: null,
    negotiation_brief_id: null,
    outreach_opportunity_id: null,
    evidence_type: "commercial_decision",
    evidence_id: "decision-1",
    evidence_label: "Commercial decision evidence",
    evidence_url: null,
    evidence_confidence: 0.91,
    source_module: "revenue_intelligence",
    source_fingerprint: "evidence-1",
    status: "active" as const,
    created_by_user_id: "user-1",
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  };
  const base: RevenueIntelligenceDashboard = {
    snapshot: {
      id: "snapshot-1",
      organization_id: "org-1",
      period_start: null,
      period_end: null,
      status: "active",
      summary: {},
      total_renewal_value_at_risk: 120000,
      price_increase_exposure: 20000,
      savings_identified: 30000,
      savings_approved: 10000,
      savings_realized: 5000,
      net_commercial_impact: -5000,
      currency: "USD",
      signal_count: 1,
      metric_count: 2,
      insight_count: 1,
      source_fingerprint: "snapshot",
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    },
    metrics: [{
      id: "metric-1",
      organization_id: "org-1",
      snapshot_id: "snapshot-1",
      contract_id: "contract-1",
      commercial_decision_id: "decision-1",
      quote_comparison_id: null,
      savings_opportunity_id: "savings-1",
      metric_type: "savings_identified",
      label: "Savings opportunity",
      amount: 30000,
      currency: "USD",
      source_module: "revenue_intelligence",
      source_fingerprint: "metric-1",
      status: "active",
      evidence_confidence: 0.86,
      metadata: {},
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    signals: [signal],
    vendorCategorySummaries: [{
      id: "summary-1",
      organization_id: "org-1",
      snapshot_id: "snapshot-1",
      vendor_name: "Vendor A",
      category_name: null,
      summary_type: "vendor",
      contract_count: 2,
      renewal_value: 120000,
      risk_signal_count: 1,
      currency: "USD",
      severity: "high",
      source_module: "revenue_intelligence",
      source_fingerprint: "summary-1",
      status: "active",
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    forecasts: [{
      id: "forecast-1",
      organization_id: "org-1",
      snapshot_id: "snapshot-1",
      scenario: "expected",
      forecasted_renewal_spend: 90000,
      forecasted_savings: 18000,
      net_commercial_impact: -12000,
      risk_adjusted_exposure: 30000,
      currency: "USD",
      confidence_score: 0.74,
      assumptions: ["Values are derived from active revenue intelligence metrics only"],
      warning_codes: ["blocked_decisions"],
      source_module: "revenue_intelligence",
      source_fingerprint: "forecast-1",
      status: "active",
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    insights: [{
      id: "insight-1",
      organization_id: "org-1",
      snapshot_id: "snapshot-1",
      title: "1 commercial decision is blocked",
      summary: "Blocked decisions are delaying renewal defense execution.",
      severity: "critical",
      recommended_action: "Resolve blocker codes.",
      confidence_score: 0.8,
      reviewed: false,
      reviewed_by_user_id: null,
      reviewed_at: null,
      source_module: "revenue_intelligence",
      source_fingerprint: "insight-1",
      status: "active",
      created_by_user_id: "user-1",
      created_at: "2030-01-01T00:00:00.000Z",
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    evidenceLinks: [evidence],
    riskQueue: [{ ...signal, evidenceLinks: [evidence] }],
    opportunities: [{
      id: "metric-1",
      type: "savings",
      title: "Savings opportunity",
      amount: 30000,
      currency: "USD",
      status: "active",
      contractId: "contract-1",
      sourceId: "savings-1",
      evidenceLinks: [evidence]
    }],
    kpis: {
      totalRenewalValueAtRisk: 120000,
      priceIncreaseExposure: 20000,
      savingsIdentified: 30000,
      savingsApproved: 10000,
      savingsRealized: 5000,
      forecastedSavings: 18000,
      netCommercialImpact: -5000,
      criticalRiskCount: 1,
      blockedDecisionCount: 1,
      approvalStalledCount: 0,
      negotiationPipelineValue: 0,
      outreachPipelineValue: 0
    }
  };
  return { ...base, ...overrides };
}

describe("RevenueCommandCenter", () => {
  it("renders leadership risk, forecast, evidence, and no-sending positioning", () => {
    render(<RevenueCommandCenter dashboard={dashboard()} canAct />);

    expect(screen.getByText("Revenue Intelligence Command Center")).toBeInTheDocument();
    expect(screen.getByText("No external sending")).toBeInTheDocument();
    expect(screen.getAllByText("Commercial decision is blocked").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Forecast scenarios")).toBeInTheDocument();
    expect(screen.getByText("Vendor and category exposure")).toBeInTheDocument();
    expect(screen.getByText("Internal outreach pipeline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh now/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Queue refresh/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("raw contract");
    expect(document.body.textContent).not.toContain("OCR output");
    expect(document.body.textContent).not.toContain("provider payload");
  });

  it("renders empty state without action controls for read-only users", () => {
    render(<RevenueCommandCenter dashboard={dashboard({
      snapshot: null,
      signals: [],
      metrics: [],
      vendorCategorySummaries: [],
      forecasts: [],
      insights: [],
      evidenceLinks: [],
      riskQueue: [],
      opportunities: []
    })} canAct={false} />);

    expect(screen.getByText("No revenue intelligence snapshot yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh now/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Queue refresh/i })).not.toBeInTheDocument();
  });
});
