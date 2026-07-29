import { describe, expect, it } from "vitest";
import { detectInternalOutreachOpportunities } from "@/lib/internal-outreach-intelligence/outreach-opportunity-detector";

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    contract_id: "contract-1",
    recommended_action: "renegotiate",
    commercial_risk_level: "critical",
    evidence_confidence: 0.91,
    estimated_savings_amount: 12000,
    currency: "USD",
    blocker_codes: [],
    warning_codes: [],
    negotiation_posture: "challenge_increase",
    renewal_deadline: "2030-05-01",
    notice_deadline: "2030-03-01",
    ...overrides
  } as any;
}

describe("internal outreach opportunity detector", () => {
  it("detects renewal risk, price increase, savings, and negotiation follow-up from shipped evidence", () => {
    const opportunities = detectInternalOutreachOpportunities({
      decision: decision(),
      quoteComparison: {
        id: "comparison-1",
        price_delta_percent: 24,
        price_delta_amount: 24000,
        currency: "USD"
      } as any,
      quoteFindings: [{
        id: "finding-1",
        finding_type: "price_increase",
        severity: "critical",
        confidence: 0.88,
        status: "open"
      } as any],
      savingsOpportunities: [{
        id: "savings-1",
        opportunity_type: "remove_unused_seats",
        estimated_savings_amount: 15000,
        currency: "USD",
        confidence: 0.83,
        status: "accepted"
      } as any],
      negotiationBrief: {
        id: "brief-1",
        status: "approved",
        strategy: "challenge_price_increase",
        confidence_score: 0.86
      } as any,
      contract: { id: "contract-1", owner_user_id: "owner-1", contract_metadata: { renewal_date: "2030-05-01" } }
    });

    expect(opportunities.map((item) => item.opportunityType)).toEqual(
      expect.arrayContaining(["renewal_risk", "price_increase", "savings_opportunity", "negotiation_follow_up"])
    );
    expect(opportunities.find((item) => item.opportunityType === "renewal_risk")).toEqual(
      expect.objectContaining({
        priority: "critical",
        audience: "internal_owner",
        recommendedChannel: "internal_email",
        evidenceConfidence: 0.91
      })
    );
  });

  it("flags missing owner and legal review as review/safety-sensitive internal opportunities", () => {
    const opportunities = detectInternalOutreachOpportunities({
      decision: decision({
        commercial_risk_level: "high",
        negotiation_posture: "legal_review_required",
        blocker_codes: ["missing_owner", "expired_notice_deadline"]
      }),
      contract: { id: "contract-1", owner_user_id: null, contract_metadata: { has_weak_evidence: true } }
    });

    expect(opportunities.map((item) => item.opportunityType)).toEqual(
      expect.arrayContaining(["legal_review", "stakeholder_review", "contract_cleanup"])
    );
    expect(opportunities.find((item) => item.opportunityType === "legal_review")?.safetyStatus).toBe("needs_review");
    expect(opportunities.find((item) => item.opportunityType === "stakeholder_review")?.blockerCodes).toContain("missing_owner");
  });
});
