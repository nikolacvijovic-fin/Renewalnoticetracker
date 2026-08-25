import { describe, expect, it } from "vitest";
import { EVIDENCE_REQUIREMENT_CONFIG } from "@/lib/evidence-readiness/config";
import { calculateEvidenceReadiness } from "@/lib/evidence-readiness/score";
import { buildEvidenceReadinessFacts, type EvidenceReadinessRuntimeContext } from "@/lib/evidence-readiness/runtime";
import type { EvidenceDecisionProfile, EvidenceReadinessFacts } from "@/lib/evidence-readiness/types";

const profiles: EvidenceDecisionProfile[] = [
  "renewal_triage",
  "renew_unchanged",
  "reduce_seats",
  "renegotiate",
  "consolidate",
  "terminate",
  "replace_vendor"
];

const verifiedSource = {
  sourceType: "customer_confirmation" as const,
  sourceRecordId: "11111111-1111-4111-8111-111111111111",
  verifiedBy: "22222222-2222-4222-8222-222222222222",
  verifiedAt: "2026-08-20T00:00:00.000Z",
  freshnessDate: "2026-08-20T00:00:00.000Z"
};

function allVerifiedFacts(): EvidenceReadinessFacts {
  return Object.fromEntries(EVIDENCE_REQUIREMENT_CONFIG.map((requirement) => [
    requirement.key,
    { state: "verified", source: verifiedSource }
  ]));
}

function assess(profile: EvidenceDecisionProfile, facts = allVerifiedFacts()) {
  return calculateEvidenceReadiness({
    organizationId: "org-1",
    contractId: "contract-1",
    decisionProfile: profile,
    facts,
    calculatedAt: "2026-08-24T00:00:00.000Z"
  });
}

function runtimeContext(overrides: Partial<EvidenceReadinessRuntimeContext> = {}): EvidenceReadinessRuntimeContext {
  return {
    contract: {
      id: "contract-1",
      organization_id: "org-1",
      is_sample: false,
      source_type: "upload",
      latest_file_id: "file-1",
      owner_user_id: "user-1",
      department: "Finance",
      updated_at: "2026-08-20T00:00:00.000Z",
      renewal_decision_status: "undecided",
      contract_metadata: {
        id: "metadata-1",
        contract_title: "Acme Subscription",
        counterparty_name: "Acme",
        renewal_date: "2026-12-31",
        auto_renewal: true,
        notice_deadline_date: "2026-11-30",
        contract_value_amount: 12000,
        contract_value_currency: "USD",
        contract_value_period: "annual",
        renewal_term: "12 months",
        needs_review: false,
        has_weak_evidence: false,
        has_conflict: false,
        reviewed_at: "2026-08-20T00:00:00.000Z",
        reviewed_by: "user-1",
        updated_at: "2026-08-20T00:00:00.000Z"
      }
    },
    decision: null,
    evidenceLinks: [],
    approvalSteps: [],
    ownerNotificationEmail: "owner@example.test",
    workspaceTimezoneConfigured: true,
    usage: {
      connectionId: "connection-1",
      connected: true,
      lastSuccessfulSyncAt: "2026-08-22T00:00:00.000Z",
      matchId: "match-1",
      matchConfidence: 0.95,
      purchasedQuantityKnown: true,
      assignedQuantityKnown: true,
      hasActiveConflict: false,
      activeMaterialFindingCount: 0,
      reviewedMaterialFindingCount: 0,
      materialFindingSourceId: null
    },
    quote: {
      comparisonId: null,
      uploaded: false,
      reviewed: false,
      priceVerified: false,
      currency: null,
      materialChangeCount: 0,
      reviewedMaterialChangeCount: 0
    },
    openEvidenceRequestCount: 0,
    preferredScenarioExchangeRateSource: null,
    now: "2026-08-24T00:00:00.000Z",
    ...overrides
  };
}

describe("deterministic evidence completeness score", () => {
  it("keeps every applicable category within its versioned weight envelope", () => {
    const categoryMaximums = {
      contract_identity: 15,
      renewal_timing: 25,
      financial: 15,
      usage_optimization: 15,
      ownership: 10,
      renewal_quote: 10,
      decision_approval: 10
    } as const;

    for (const profile of profiles) {
      const result = assess(profile);
      for (const category of result.categories) {
        expect(category.applicableWeight).toBeLessThanOrEqual(categoryMaximums[category.category]);
      }
    }
  });

  it("calculates exact applicable weight and excludes not-applicable requirements", () => {
    const facts = allVerifiedFacts();
    facts.owner_assigned = { state: "missing" };
    const result = assess("renewal_triage", facts);

    expect(result.items.filter((item) => item.state === "not_applicable").map((item) => item.requirementKey)).toContain("usage_snapshot_fresh");
    expect(result.score).toBe(96);
    expect(result.readinessState).toBe("incomplete");
  });

  it("never lets a high score override a critical blocker", () => {
    const facts = allVerifiedFacts();
    facts.notice_timing_verified = { state: "conflicting" };
    const result = assess("renewal_triage", facts);

    expect(result.score).toBeGreaterThan(85);
    expect(result.readinessState).toBe("blocked");
    expect(result.criticalBlockers.map((item) => item.requirementKey)).toContain("notice_timing_verified");
  });

  it("awards only forty percent for present unreviewed evidence", () => {
    const facts = allVerifiedFacts();
    facts.contract_scope_verified = { state: "present_unreviewed", source: verifiedSource };
    const result = assess("renewal_triage", facts);
    const item = result.items.find((entry) => entry.requirementKey === "contract_scope_verified");

    expect(item?.earnedWeight).toBe(0.8);
    expect(result.readinessState).toBe("review_required");
  });

  it("makes stale usage and ambiguous matching critical for seat reduction", () => {
    const facts = allVerifiedFacts();
    facts.usage_snapshot_fresh = { state: "stale", source: verifiedSource };
    facts.product_contract_match = { state: "insufficient", source: verifiedSource };
    const result = assess("reduce_seats", facts);

    expect(result.readinessState).toBe("blocked");
    expect(result.criticalBlockers.map((item) => item.requirementKey)).toEqual(expect.arrayContaining([
      "usage_snapshot_fresh",
      "product_contract_match"
    ]));
  });

  it("adapts quote and termination requirements by decision profile", () => {
    const renegotiate = assess("renegotiate");
    const terminate = assess("terminate");

    expect(renegotiate.items.find((item) => item.requirementKey === "renewal_quote_uploaded")?.state).toBe("verified");
    expect(renegotiate.items.find((item) => item.requirementKey === "termination_method_verified")?.state).toBe("not_applicable");
    expect(terminate.items.find((item) => item.requirementKey === "renewal_quote_uploaded")?.state).toBe("not_applicable");
    expect(terminate.items.find((item) => item.requirementKey === "termination_method_verified")?.critical).toBe(true);
  });

  it("excludes sample evidence and resolved findings from runtime facts", () => {
    const context = runtimeContext({
      contract: { ...runtimeContext().contract, is_sample: true },
      usage: { ...runtimeContext().usage, activeMaterialFindingCount: 0, reviewedMaterialFindingCount: 0 }
    });
    const facts = buildEvidenceReadinessFacts(context);

    expect(facts.real_contract_source?.state).toBe("insufficient");
    expect(facts.material_findings_reviewed?.state).toBe("not_applicable");
    expect(assess("renewal_triage", facts).score).toBe(0);
  });

  it("blocks cross-currency comparison without an approved conversion source", () => {
    const context = runtimeContext({
      quote: {
        comparisonId: "quote-1",
        uploaded: true,
        reviewed: true,
        priceVerified: true,
        currency: "EUR",
        materialChangeCount: 1,
        reviewedMaterialChangeCount: 1
      }
    });
    const withoutSource = buildEvidenceReadinessFacts(context);
    const withSource = buildEvidenceReadinessFacts({ ...context, preferredScenarioExchangeRateSource: "ECB 2026-08-24" });

    expect(withoutSource.financial_conflict_free?.state).toBe("conflicting");
    expect(assess("renegotiate", withoutSource).readinessState).toBe("blocked");
    expect(withSource.financial_conflict_free?.state).toBe("verified");
  });

  it("blocks unreviewed critical extraction and timing evidence", () => {
    const context = runtimeContext({
      contract: {
        ...runtimeContext().contract,
        contract_metadata: {
          ...(runtimeContext().contract.contract_metadata as Record<string, unknown>),
          reviewed_at: null,
          needs_review: true
        }
      }
    });
    const facts = buildEvidenceReadinessFacts(context);
    const result = assess("renewal_triage", facts);

    expect(facts.contract_extraction_reviewed?.state).toBe("insufficient");
    expect(facts.notice_timing_verified?.state).toBe("insufficient");
    expect(result.readinessState).toBe("blocked");
  });

  it("invalidates approval readiness after a material evidence version change", () => {
    const context = runtimeContext({
      decision: {
        id: "decision-1",
        organization_id: "org-1",
        contract_id: "contract-1",
        decision_type: "renew_unchanged",
        decision_version: 2,
        approved_version: null,
        approved_at: "2026-08-20T00:00:00.000Z"
      } as EvidenceReadinessRuntimeContext["decision"]
    });
    const facts = buildEvidenceReadinessFacts(context);

    expect(facts.approval_evidence_current?.state).toBe("conflicting");
  });

  it("requires recorded human approval for a termination decision", () => {
    const context = runtimeContext({
      decision: {
        id: "decision-terminate",
        organization_id: "org-1",
        contract_id: "contract-1",
        decision_type: "terminate",
        decision_owner_user_id: "user-1",
        decision_deadline: "2026-11-15",
        decision_version: 1,
        approved_version: null,
        approved_at: null,
        separation_of_duties_required: false
      } as EvidenceReadinessRuntimeContext["decision"],
      evidenceLinks: [{
        id: "evidence-termination",
        organization_id: "org-1",
        contract_id: "contract-1",
        decision_id: "decision-terminate",
        evidence_type: "contract_extraction_field",
        evidence_id: "citation-1",
        evidence_label: "Termination notice method",
        confidence: 0.95,
        risk_level: null,
        metadata: {},
        created_by_user_id: "user-1",
        created_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-20T00:00:00Z"
      }]
    });
    const facts = buildEvidenceReadinessFacts(context);
    const result = assess("terminate", facts);

    expect(facts.termination_method_verified?.state).toBe("verified");
    expect(facts.approval_evidence_current?.state).toBe("missing");
    expect(result.readinessState).toBe("blocked");
  });

  it("produces the same evidence hash for identical recalculation timestamps", () => {
    const first = assess("renewal_triage");
    const second = calculateEvidenceReadiness({
      organizationId: "org-1",
      contractId: "contract-1",
      decisionProfile: "renewal_triage",
      facts: allVerifiedFacts(),
      calculatedAt: "2026-09-01T00:00:00.000Z"
    });

    expect(first.evidenceHash).toBe(second.evidenceHash);
    expect(first.score).toBe(second.score);
  });

  it("keeps safe bounded provenance on every verified item", () => {
    const result = assess("renewal_triage");
    expect(result.verifiedEvidence.every((item) => item.sourceRecordId && item.evidenceSource)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/raw contract|provider payload|bearer token|private note/i);
  });

  it("moves a fully reviewed real contract to decision-ready without AI inference", () => {
    const context = runtimeContext({
      decision: {
        id: "decision-1",
        organization_id: "org-1",
        contract_id: "contract-1",
        decision_type: "renew_unchanged",
        decision_owner_user_id: "user-1",
        decision_deadline: "2026-11-15",
        decision_version: 1,
        approved_version: null,
        approved_at: null,
        separation_of_duties_required: false
      } as EvidenceReadinessRuntimeContext["decision"]
    });
    const facts = buildEvidenceReadinessFacts(context);
    const result = calculateEvidenceReadiness({
      organizationId: "org-1",
      contractId: "contract-1",
      decisionProfile: "renew_unchanged",
      facts,
      calculatedAt: "2026-08-24T00:00:00.000Z"
    });

    expect(result.score).toBe(100);
    expect(result.readinessState).toBe("decision_ready");
    expect(result.criticalBlockers).toEqual([]);
    expect(result.verifiedEvidence.every((item) => item.sourceRecordId && item.evidenceSource)).toBe(true);
  });
});
