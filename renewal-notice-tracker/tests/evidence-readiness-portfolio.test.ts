import { describe, expect, it } from "vitest";
import { buildFounderEvidenceReadinessSummary } from "@/lib/evidence-readiness/founder-summary";
import { attachEvidenceReadinessToPortfolio, filterRenewalPortfolio, type RenewalPortfolioItem } from "@/lib/renewal-workspace/portfolio";

function item(contractId: string, daysRemaining: number): RenewalPortfolioItem {
  return {
    decisionId: `decision-${contractId}`,
    contractId,
    contractTitle: contractId,
    vendor: "Vendor",
    ownerUserId: "owner-1",
    department: "Finance",
    noticeDeadline: "2026-09-01",
    renewalDeadline: "2026-10-01",
    daysRemaining,
    decisionType: "renew_unchanged",
    approvalState: "draft",
    risk: "medium",
    currency: "USD",
    expectedSavings: null,
    confirmedSavings: null,
    outcomeConfirmedAt: null,
    evidenceScore: null,
    evidenceReadinessState: null,
    criticalBlockerCount: 0,
    nextEvidenceAction: null,
    missingEvidenceCategories: []
  };
}

describe("evidence readiness portfolio and founder support", () => {
  it("prioritizes critical blockers then nearest verified deadline", () => {
    const result = attachEvidenceReadinessToPortfolio(
      [item("contract-near", 2), item("contract-blocked", 12), item("contract-ready", 1)],
      [
        { contract_id: "contract-near", decision_profile: "renew_unchanged", score: 70, readiness_state: "review_required", critical_blocker_count: 0, next_recommended_action: "Review", evidence_readiness_items: [] },
        { contract_id: "contract-blocked", decision_profile: "renew_unchanged", score: 90, readiness_state: "blocked", critical_blocker_count: 2, next_recommended_action: "Resolve", evidence_readiness_items: [{ category: "renewal_timing", state: "conflicting" }] },
        { contract_id: "contract-ready", decision_profile: "renew_unchanged", score: 100, readiness_state: "decision_ready", critical_blocker_count: 0, next_recommended_action: "Ready", evidence_readiness_items: [] }
      ]
    );

    expect(result.map((entry) => entry.contractId)).toEqual(["contract-blocked", "contract-ready", "contract-near"]);
    expect(result[0]?.missingEvidenceCategories).toEqual(["renewal_timing"]);
    expect(filterRenewalPortfolio(result, { readinessState: "blocked" })).toHaveLength(1);
    expect(filterRenewalPortfolio(result, { missingEvidenceCategory: "renewal_timing" })).toHaveLength(1);
  });

  it("builds bounded founder readiness health without customer evidence content", () => {
    const summary = buildFounderEvidenceReadinessSummary({
      now: "2026-08-24T00:00:00.000Z",
      assessments: [{
        contract_id: "contract-1",
        score: 62,
        readiness_state: "blocked",
        evidence_readiness_items: [
          { category: "renewal_timing", state: "missing" },
          { category: "financial", state: "stale" }
        ]
      }],
      connections: [{ status: "connected", last_successful_sync_at: "2026-08-01T00:00:00.000Z" }],
      contracts: [{
        id: "contract-1",
        contract_metadata: { notice_deadline_date: "2026-09-01", reviewed_at: null, needs_review: true, has_weak_evidence: true }
      }],
      history: [{ contract_id: "contract-1", readiness_state: "decision_ready", calculated_at: "2026-08-22T00:00:00.000Z" }],
      files: [{ contract_id: "contract-1", uploaded_at: "2026-08-20T00:00:00.000Z" }]
    });

    expect(summary).toMatchObject({
      averageReadinessScore: 62,
      blockedContractCount: 1,
      staleProviderConnectionCount: 1,
      unreviewedExtractionBacklogCount: 1,
      approachingDeadlineWithoutReadyEvidenceCount: 1,
      averageUploadToDecisionReadyHours: 48
    });
    expect(summary.commonMissingEvidence[0]).toEqual({ category: "financial", count: 1 });
    expect(JSON.stringify(summary)).not.toMatch(/raw contract|provider payload|private note/i);
  });

  it("counts only the latest decision profile assessment per contract", () => {
    const summary = buildFounderEvidenceReadinessSummary({
      assessments: [
        { contract_id: "contract-1", score: 20, readiness_state: "blocked", calculated_at: "2026-08-20T00:00:00Z", evidence_readiness_items: [] },
        { contract_id: "contract-1", score: 90, readiness_state: "decision_ready", calculated_at: "2026-08-21T00:00:00Z", evidence_readiness_items: [] }
      ],
      connections: [],
      contracts: [],
      history: [],
      files: [],
      now: "2026-08-24T00:00:00Z"
    });

    expect(summary.averageReadinessScore).toBe(90);
    expect(summary.blockedContractCount).toBe(0);
  });
});
