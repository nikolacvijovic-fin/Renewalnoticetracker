import { describe, expect, it } from "vitest";
import { buildNegotiationBrief } from "@/lib/negotiation-workflow/negotiation-brief-builder";

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: "decision-1",
    recommended_action: "renegotiate",
    commercial_risk_level: "high",
    evidence_confidence: 0.9,
    currency: "USD",
    blocker_codes: [],
    warning_codes: [],
    notice_deadline: "2030-03-01",
    ...overrides
  } as any;
}

function comparison(overrides: Record<string, unknown> = {}) {
  return {
    id: "comparison-1",
    status: "completed",
    price_delta_percent: 20,
    overall_risk_level: "critical",
    ...overrides
  } as any;
}

function finding(type: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `${type}-1`,
    finding_type: type,
    severity: "critical",
    confidence: 0.92,
    status: "open",
    ...overrides
  } as any;
}

describe("buildNegotiationBrief", () => {
  it("creates a challenge-price-increase strategy for critical quote increases", () => {
    const brief = buildNegotiationBrief({
      decision: decision(),
      quoteComparison: comparison(),
      quoteFindings: [finding("price_increase")],
      savingsOpportunities: [],
      acceptedExtractedFields: []
    });

    expect(brief.strategy).toBe("challenge_price_increase");
    expect(brief.status).toBe("ready_for_review");
    expect(brief.targetAsk).toContain("Challenge the price increase");
  });

  it("prioritizes removed discount preservation when that finding exists", () => {
    const brief = buildNegotiationBrief({
      decision: decision(),
      quoteComparison: comparison({ price_delta_percent: 5 }),
      quoteFindings: [finding("discount_removed", { severity: "high" })],
      savingsOpportunities: []
    });

    expect(brief.strategy).toBe("preserve_existing_discount");
  });

  it("uses savings opportunities as a discount request anchor", () => {
    const brief = buildNegotiationBrief({
      decision: decision(),
      quoteComparison: comparison({ price_delta_percent: 2 }),
      quoteFindings: [],
      savingsOpportunities: [
        {
          id: "saving-1",
          opportunity_type: "unused_seats",
          estimated_savings_amount: 12000,
          currency: "USD",
          confidence: 0.88,
          status: "open"
        } as any
      ]
    });

    expect(brief.strategy).toBe("request_discount");
    expect(brief.savingsArgument).toContain("12000 USD");
  });

  it("escalates expired notice-deadline risk before vendor messaging", () => {
    const brief = buildNegotiationBrief({
      decision: decision({ blocker_codes: ["expired_notice_deadline"] }),
      quoteComparison: comparison(),
      quoteFindings: [finding("price_increase")]
    });

    expect(brief.strategy).toBe("escalate_to_legal");
    expect(brief.reviewFlags).toContain("legal_review_required");
  });

  it("keeps missing evidence pending and flags low confidence", () => {
    const brief = buildNegotiationBrief({
      decision: decision({ evidence_confidence: 0.4 }),
      quoteComparison: null,
      quoteFindings: [],
      acceptedExtractedFields: [{ field_key: "renewal_date", confidence: 0.4 } as any]
    });

    expect(brief.status).toBe("evidence_pending");
    expect(brief.blockerCodes).toContain("missing_quote_comparison");
    expect(brief.reviewFlags).toContain("low_confidence_evidence");
  });
});
