import { describe, expect, it } from "vitest";
import { aggregateRevenueIntelligence } from "@/lib/revenue-intelligence/revenue-intelligence-aggregator";
import { buildRevenueForecastScenarios } from "@/lib/revenue-intelligence/revenue-forecasting";
import { generateExecutiveInsights } from "@/lib/revenue-intelligence/executive-insight-generator";
import type { RevenueIntelligenceSourceData } from "@/lib/revenue-intelligence/revenue-intelligence-source-queries";

function sourceData(): RevenueIntelligenceSourceData {
  return {
    organizationId: "org-1",
    contracts: [
      {
        id: "contract-1",
        owner_user_id: "owner-1",
        cycle_status: "open",
        renewal_decision_status: "undecided",
        department: "Finance",
        status_tag: "saas",
        metadata: {
          counterparty_name: "Vendor A",
          contract_type: "SaaS",
          renewal_date: "2030-04-01",
          notice_deadline_date: "2030-03-01",
          contract_value_amount: 120000,
          contract_value_currency: "USD",
          needs_review: true
        },
        reminders: [{ id: "reminder-1", status: "blocked", remind_at: "2030-02-01" }]
      },
      {
        id: "contract-2",
        owner_user_id: "owner-2",
        cycle_status: "open",
        renewal_decision_status: "undecided",
        department: "Finance",
        status_tag: "saas",
        metadata: {
          counterparty_name: "Vendor A",
          contract_type: "SaaS",
          notice_deadline_date: "2029-01-01",
          contract_value_amount: 80000,
          contract_value_currency: "USD"
        },
        reminders: []
      }
    ],
    quoteComparisons: [{
      id: "comparison-1",
      contract_id: "contract-1",
      status: "completed",
      price_delta_amount: 20000,
      price_delta_percent: 20,
      currency: "USD",
      overall_risk_level: "high"
    }],
    quoteFindings: [{
      id: "finding-1",
      contract_id: "contract-1",
      comparison_id: "comparison-1",
      finding_type: "price_increase",
      severity: "critical",
      confidence: 0.9,
      status: "open"
    }],
    savingsOpportunities: [{
      id: "savings-1",
      contract_id: "contract-1",
      comparison_id: "comparison-1",
      opportunity_type: "discount",
      title: "Renewal discount opportunity",
      estimated_savings_amount: 30000,
      currency: "USD",
      confidence: 0.86,
      status: "identified",
      owner_user_id: "owner-1"
    }],
    commercialDecisions: [{
      id: "decision-1",
      contract_id: "contract-1",
      decision_status: "in_approval",
      commercial_risk_level: "critical",
      estimated_savings_amount: 45000,
      currency: "USD",
      blocker_codes: ["missing_approver"],
      warning_codes: [],
      evidence_confidence: 0.91,
      owner_user_id: "owner-1",
      approver_user_id: null,
      updated_at: "2030-01-01T00:00:00.000Z"
    }],
    negotiationBriefs: [{
      id: "brief-1",
      contract_id: "contract-1",
      commercial_decision_id: "decision-1",
      status: "ready_for_review",
      target_savings_amount: 25000,
      currency: "USD",
      evidence_confidence: 0.82
    }],
    outreachOpportunities: [{
      id: "outreach-1",
      contract_id: "contract-1",
      commercial_decision_id: "decision-1",
      negotiation_brief_id: "brief-1",
      opportunity_type: "churn_prevention",
      status: "ready_for_review",
      priority: "high",
      expected_commercial_impact: { estimatedSavingsAmount: 15000 },
      evidence_confidence: 0.8
    }]
  };
}

describe("revenue intelligence aggregation", () => {
  it("aggregates decision, quote, savings, negotiation, outreach, reminder, and concentration evidence", () => {
    const result = aggregateRevenueIntelligence(sourceData(), {
      now: new Date("2030-01-15T00:00:00.000Z")
    });

    expect(result.signals.map((signal) => signal.signal_type)).toEqual(
      expect.arrayContaining([
        "renewal_at_risk",
        "decision_blocked",
        "approval_stalled",
        "price_increase",
        "critical_quote_finding",
        "savings_opportunity",
        "negotiation_in_progress",
        "churn_prevention",
        "trusted_reminder_blocked",
        "weak_contract_evidence",
        "expired_notice_deadline",
        "vendor_concentration",
        "category_concentration"
      ])
    );
    expect(result.metrics.map((metric) => metric.metric_type)).toEqual(
      expect.arrayContaining([
        "renewal_value_at_risk",
        "price_increase_exposure",
        "savings_identified",
        "negotiation_pipeline_value",
        "outreach_pipeline_value",
        "vendor_concentration_value",
        "category_concentration_value"
      ])
    );
    expect(JSON.stringify(result)).not.toContain("raw contract");
    expect(JSON.stringify(result)).not.toContain("OCR output");
    expect(JSON.stringify(result)).not.toContain("provider payload");
  });

  it("builds deterministic forecast scenarios and executive insights from aggregated evidence", () => {
    const aggregated = aggregateRevenueIntelligence(sourceData(), {
      now: new Date("2030-01-15T00:00:00.000Z")
    });
    const forecasts = buildRevenueForecastScenarios({
      metrics: aggregated.metrics,
      signals: aggregated.signals
    });
    const insights = generateExecutiveInsights({
      signals: aggregated.signals,
      metrics: aggregated.metrics,
      vendorCategorySummaries: aggregated.vendorCategorySummaries
    });

    expect(forecasts.map((forecast) => forecast.scenario)).toEqual([
      "conservative",
      "expected",
      "aggressive",
      "risk_adjusted"
    ]);
    expect(forecasts.find((forecast) => forecast.scenario === "risk_adjusted")?.warning_codes).toContain("blocked_decisions");
    expect(insights.map((insight) => insight.source_fingerprint)).toEqual(
      expect.arrayContaining([
        "revenue_insight:critical_quote_findings",
        "revenue_insight:expired_notice_deadlines",
        "revenue_insight:savings_not_approved"
      ])
    );
  });
});
