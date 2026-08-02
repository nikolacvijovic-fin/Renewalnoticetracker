import { describe, expect, it } from "vitest";
import { buildUnifiedIntelligenceSummary } from "@/lib/intelligence/unified-intelligence-engine";
import { evaluateSaasRenewalRules } from "@/lib/rules/saas-renewal-rules";

describe("unified intelligence engine", () => {
  it("aggregates renewal-defense facts and rule outcomes into a CFO-readable summary", () => {
    const ruleOutcomes = evaluateSaasRenewalRules({
      noticeDeadline: "2026-08-05",
      today: "2026-08-02",
      autoRenewal: true,
      ownerUserId: null,
      evidenceConfidence: 0.5,
      contractValueAmount: 50000,
      contractValueCurrency: "USD",
      metadataConflictCount: 1
    });

    const summary = buildUnifiedIntelligenceSummary({
      organizationId: "org-1",
      generatedAt: "2026-08-02T10:00:00.000Z",
      contracts: [{ id: "contract-1", title: "Acme Cloud", contractValueAmount: 50000 }],
      saasOptOutItems: [
        {
          contractId: "contract-1",
          deadlineWindow: "due_7_days",
          workflowStatus: "needs_review",
          ownerUserId: null,
          spendAtRiskAmount: 50000
        }
      ],
      ruleOutcomes
    });

    expect(summary.organizationId).toBe("org-1");
    expect(summary.spendAtRiskAmount).toBe(50000);
    expect(summary.upcomingDeadlines).toEqual([
      { contractId: "contract-1", deadlineWindow: "due_7_days", spendAtRiskAmount: 50000 }
    ]);
    expect(summary.trustGaps).toEqual(expect.arrayContaining(["weak_evidence", "missing_owner", "metadata_conflict"]));
    expect(summary.dataQualityIssues).toEqual(expect.arrayContaining(["weak_evidence", "metadata_conflict"]));
    expect(summary.blockers.length).toBeGreaterThan(0);
    expect(summary.confidenceScore).toBeLessThan(100);
  });
});
