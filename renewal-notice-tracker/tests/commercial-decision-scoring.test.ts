import { describe, expect, it } from "vitest";
import { scoreCommercialDecision } from "@/lib/commercial-decision-workbench/decision-scoring";
import type { CommercialDecisionScoreInput } from "@/lib/commercial-decision-workbench/decision-types";

function baseInput(overrides: Partial<CommercialDecisionScoreInput> = {}): CommercialDecisionScoreInput {
  return {
    now: "2030-01-15T00:00:00.000Z",
    contract: {
      id: "contract-1",
      owner_user_id: "owner-1",
      cycle_status: "active",
      renewal_decision_status: "undecided",
      contract_metadata: {
        renewal_date: "2030-05-01",
        notice_deadline_date: "2030-03-01",
        contract_value_currency: "USD"
      }
    },
    acceptedExtractedFields: [{ field_key: "renewal_date", confidence: 0.92 }],
    quoteComparison: {
      id: "comparison-1",
      status: "completed",
      overall_risk_level: "low",
      price_delta_percent: 2,
      price_delta_amount: 100,
      currency: "USD"
    },
    quoteFindings: [],
    savingsOpportunities: [],
    trustedReminderGate: { blocked: false },
    ...overrides
  };
}

describe("commercial decision scoring", () => {
  it("blocks readiness when owner or renewal date evidence is missing", () => {
    const score = scoreCommercialDecision(
      baseInput({
        contract: {
          id: "contract-1",
          owner_user_id: null,
          contract_metadata: { notice_deadline_date: "2030-03-01" }
        }
      })
    );

    expect(score.readinessStatus).toBe("blocked");
    expect(score.decisionStatus).toBe("evidence_pending");
    expect(score.recommendedAction).toBe("needs_review");
    expect(score.ownerUserId).toBeNull();
    expect(score.blockerCodes).toEqual(expect.arrayContaining(["missing_owner", "missing_renewal_date"]));
  });

  it("keeps decisions evidence-pending when quote comparison evidence is missing", () => {
    const score = scoreCommercialDecision(baseInput({ quoteComparison: null }));

    expect(score.readinessStatus).toBe("evidence_pending");
    expect(score.decisionStatus).toBe("evidence_pending");
    expect(score.blockerCodes).toContain("missing_quote_comparison");
  });

  it("turns critical quote findings into renegotiation posture", () => {
    const score = scoreCommercialDecision(
      baseInput({
        quoteComparison: {
          id: "comparison-1",
          status: "completed",
          overall_risk_level: "critical",
          price_delta_percent: 28,
          price_delta_amount: 12000,
          currency: "USD"
        },
        quoteFindings: [
          {
            id: "finding-1",
            finding_type: "price_increase",
            severity: "critical",
            confidence: 0.94,
            status: "open"
          }
        ]
      })
    );

    expect(score.commercialRiskLevel).toBe("critical");
    expect(score.recommendedAction).toBe("renegotiate");
    expect(score.negotiationPosture).toBe("challenge_increase");
    expect(score.warningCodes).toContain("critical_quote_finding");
  });

  it("turns savings opportunity evidence into ask-for-discount guidance", () => {
    const score = scoreCommercialDecision(
      baseInput({
        savingsOpportunities: [
          {
            id: "opportunity-1",
            opportunity_type: "price_increase",
            estimated_savings_amount: 4500,
            currency: "USD",
            confidence: 0.86,
            status: "open"
          }
        ]
      })
    );

    expect(score.estimatedSavingsAmount).toBe(4500);
    expect(score.recommendedAction).toBe("renegotiate");
    expect(score.negotiationPosture).toBe("ask_for_discount");
    expect(score.warningCodes).toContain("high_savings_opportunity");
  });

  it("warns on weak extraction evidence without copying raw evidence", () => {
    const score = scoreCommercialDecision(
      baseInput({
        contract: {
          id: "contract-1",
          owner_user_id: "owner-1",
          contract_metadata: {
            renewal_date: "2030-05-01",
            notice_deadline_date: "2030-03-01",
            has_weak_evidence: true
          }
        },
        acceptedExtractedFields: [{ field_key: "notice_deadline_date", confidence: 0.44 }]
      })
    );

    expect(score.warningCodes).toContain("weak_contract_evidence");
    expect(score.evidenceConfidenceLabel).toBe("weak");
  });

  it("escalates expired notice deadlines ahead of renewal action", () => {
    const score = scoreCommercialDecision(
      baseInput({
        now: "2030-04-01T00:00:00.000Z",
        contract: {
          id: "contract-1",
          owner_user_id: "owner-1",
          contract_metadata: {
            renewal_date: "2030-05-01",
            notice_deadline_date: "2030-03-01"
          }
        }
      })
    );

    expect(score.blockerCodes).toContain("expired_notice_deadline");
    expect(score.commercialRiskLevel).toBe("critical");
    expect(score.recommendedAction).toBe("escalate");
    expect(score.negotiationPosture).toBe("legal_review_required");
  });

  it.each([
    ["not_configured", false, true],
    ["configured_ready", false, false],
    ["configured_blocked_by_review", true, false],
    ["configured_blocked_by_owner", true, false],
    ["configured_blocked_by_dates", true, false],
    ["not_applicable", false, false]
  ] as const)("scores trusted reminder readiness state %s precisely", (status, blocked, warningOnly) => {
    const score = scoreCommercialDecision(
      baseInput({
        trustedReminderGate: { status }
      })
    );

    expect(score.trustedReminderReadinessStatus).toBe(status);
    expect(score.blockerCodes.includes("trusted_reminder_blocked")).toBe(blocked);
    expect(score.warningCodes.includes("trusted_reminder_not_configured")).toBe(warningOnly);
  });
});
