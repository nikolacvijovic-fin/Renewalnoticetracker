import { describe, expect, it } from "vitest";
import {
  assertIsoDate,
  assertRenewalWorkspaceTransition,
  assertRenewalTaskActorScope,
  assertRenewalTaskTransition,
  calculateRenewalScenario,
  evaluateRenewalApprovalPolicy,
  evaluateVerifiedWorkspaceCandidate,
  materialDecisionFingerprint,
  sanitizeRenewalWorkspaceAuditMetadata,
  validateEvidenceReferences
} from "@/lib/renewal-workspace/renewal-workspace";
import { filterRenewalPortfolio, normalizeRenewalPortfolioRows } from "@/lib/renewal-workspace/portfolio";

const reviewedEvidence = [{
  evidenceType: "reviewed_contract_metadata" as const,
  evidenceId: "metadata-1",
  label: "Reviewed annual value",
  reviewed: true,
  confidence: 0.95
}];

describe("renewal decision workspace", () => {
  it("enforces the decision lifecycle and rejects skipped approval states", () => {
    expect(assertRenewalWorkspaceTransition("draft", "ready_for_review")).toMatchObject({ allowed: true });
    expect(assertRenewalWorkspaceTransition("awaiting_approval", "approved")).toMatchObject({ allowed: true });
    expect(assertRenewalWorkspaceTransition("decision_recorded", "outcome_confirmed")).toMatchObject({ allowed: true });
    expect(() => assertRenewalWorkspaceTransition("draft", "approved")).toThrow("invalid_renewal_workspace_transition");
    expect(() => assertRenewalWorkspaceTransition("outcome_confirmed", "draft")).toThrow("invalid_renewal_workspace_transition");
  });

  it("keeps terminal task states terminal and requires explicit valid progress", () => {
    expect(assertRenewalTaskTransition("open", "in_progress")).toMatchObject({ allowed: true });
    expect(assertRenewalTaskTransition("blocked", "in_progress")).toMatchObject({ allowed: true });
    expect(() => assertRenewalTaskTransition("completed", "open")).toThrow("invalid_renewal_task_transition");
    expect(() => assertRenewalTaskTransition("blocked", "completed")).toThrow("invalid_renewal_task_transition");
  });

  it("allows reviewers to update only tasks assigned to themselves", () => {
    expect(assertRenewalTaskActorScope({
      actorRole: "reviewer",
      actorUserId: "reviewer-1",
      taskOwnerUserId: "reviewer-1",
      operation: "transition"
    })).toEqual({ allowed: true });
    expect(() => assertRenewalTaskActorScope({
      actorRole: "reviewer",
      actorUserId: "reviewer-1",
      taskOwnerUserId: "reviewer-2",
      operation: "transition"
    })).toThrow("reviewer_can_only_update_assigned_renewal_tasks");
    expect(() => assertRenewalTaskActorScope({
      actorRole: "reviewer",
      actorUserId: "reviewer-1",
      operation: "create"
    })).toThrow("reviewer_cannot_create_renewal_tasks");
  });

  it("calculates comparable scenarios and keeps estimated value separate", () => {
    expect(calculateRenewalScenario({
      currentAnnualCost: 120_000,
      currentCurrency: "USD",
      annualCost: 90_000,
      currency: "USD",
      oneTimeTransitionCost: 5_000,
      commitmentYears: 3,
      evidence: reviewedEvidence
    })).toEqual({
      currentAnnualCost: 120_000,
      annualCost: 90_000,
      changeFromCurrentCost: -30_000,
      estimatedSavings: 30_000,
      oneTimeTransitionCost: 5_000,
      netFirstYearEffect: 25_000,
      commitmentYears: 3,
      multiYearCommittedCost: 275_000,
      currency: "USD",
      exchangeRateSource: null,
      evidenceCompleteness: 1
    });
  });

  it("does not combine currencies without an explicit exchange-rate source", () => {
    expect(() => calculateRenewalScenario({
      currentAnnualCost: 100,
      currentCurrency: "EUR",
      annualCost: 100,
      currency: "USD"
    })).toThrow("explicit_exchange_rate_source_required");
    expect(calculateRenewalScenario({
      currentAnnualCost: 100,
      currentCurrency: "EUR",
      annualCost: 90,
      currency: "USD",
      exchangeRate: 1.1,
      exchangeRateSource: "Customer-provided treasury rate"
    })).toMatchObject({ currentAnnualCost: 110, estimatedSavings: 20, exchangeRateSource: "Customer-provided treasury rate" });
  });

  it("requires reviewed evidence and valid calendar dates", () => {
    expect(validateEvidenceReferences(reviewedEvidence)).toHaveLength(1);
    expect(() => validateEvidenceReferences([{ ...reviewedEvidence[0]!, reviewed: false }])).toThrow("unreviewed_evidence");
    expect(assertIsoDate("2026-08-24")).toBe("2026-08-24");
    expect(() => assertIsoDate("2026-02-31")).toThrow("date_must_be_iso_date");
  });

  it("requires separation for material decisions and blocks decision-owner self approval", () => {
    const policy = evaluateRenewalApprovalPolicy({
      decisionType: "terminate",
      contractValue: 150_000,
      proposedSavings: 30_000,
      evidenceConfidence: 0.9,
      terminationRisk: true,
      actorRole: "admin",
      actorUserId: "owner-1",
      decisionOwnerUserId: "owner-1"
    });
    expect(policy.approvalRequired).toBe(true);
    expect(policy.separationRequired).toBe(true);
    expect(policy.canSelfApprove).toBe(false);
    expect(policy.reasonCodes).toEqual(expect.arrayContaining(["high_contract_value", "termination_risk"]));
  });

  it("changes the material decision fingerprint when approved facts change", () => {
    const base = {
      decisionType: "renew_unchanged" as const,
      rationale: "Reviewed current terms",
      preferredScenarioId: "scenario-1",
      estimatedFinancialEffect: 10,
      currency: "USD",
      decisionDeadline: "2026-09-01",
      evidenceIds: ["evidence-1"]
    };
    expect(materialDecisionFingerprint(base)).not.toBe(materialDecisionFingerprint({ ...base, preferredScenarioId: "scenario-2" }));
  });

  it("allows automatic workspace candidates only from reviewed, non-sample contract data", () => {
    expect(evaluateVerifiedWorkspaceCandidate({
      contractId: "contract-1",
      renewalDate: "2026-10-01",
      needsReview: false,
      hasWeakEvidence: false,
      reviewedAt: "2026-08-20T00:00:00Z"
    })).toEqual({ eligible: true, contractId: "contract-1", reasonCodes: [] });
    expect(evaluateVerifiedWorkspaceCandidate({
      contractId: "contract-2",
      isSample: true,
      noticeDeadlineDate: "2026-09-01",
      needsReview: true
    })).toMatchObject({ eligible: false, reasonCodes: expect.arrayContaining(["sample_contract", "reviewed_metadata_required"]) });
  });

  it("sanitizes audit metadata to a narrow scalar allowlist", () => {
    const safe = sanitizeRenewalWorkspaceAuditMetadata({
      organizationId: "org-1",
      decisionId: "decision-1",
      decisionVersion: 2,
      reasonCodes: ["approval_required"],
      rawContractText: "sensitive customer text",
      providerPayload: { secret: "token" },
      privateNote: "hidden"
    });
    expect(safe).toEqual({ organizationId: "org-1", decisionId: "decision-1", decisionVersion: 2, reasonCodes: ["approval_required"] });
    expect(JSON.stringify(safe)).not.toContain("sensitive customer text");
  });

  it("normalizes and filters only organization-scoped portfolio rows supplied by the repository", () => {
    const rows = normalizeRenewalPortfolioRows([{
      id: "decision-1",
      contract_id: "contract-1",
      notice_deadline: "2026-09-01",
      decision_type: "renegotiate_price_or_terms",
      decision_status: "in_approval",
      commercial_risk_level: "high",
      estimated_financial_effect: 5000,
      realized_savings_amount: null,
      currency: "USD",
      contracts: { id: "contract-1", owner_user_id: "member-1", department: "Finance", contract_metadata: [{ contract_title: "Acme", counterparty_name: "Acme Inc" }] }
    }], new Date("2026-08-24T00:00:00Z"));
    expect(rows[0]).toMatchObject({ contractTitle: "Acme", vendor: "Acme Inc", daysRemaining: 8, expectedSavings: 5000, confirmedSavings: null });
    expect(filterRenewalPortfolio(rows, { owner: "member-1", currency: "usd" })).toHaveLength(1);
    expect(filterRenewalPortfolio(rows, { owner: "member-2" })).toHaveLength(0);
  });
});
