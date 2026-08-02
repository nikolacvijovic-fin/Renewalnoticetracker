import { describe, expect, it } from "vitest";
import { buildRenewalCommandActions } from "@/lib/dashboard/renewal-command-actions";
import {
  buildRenewalCommandCenter,
  type RenewalCommandContractInput
} from "@/lib/dashboard/renewal-command-center";
import type { TrustExceptionApproval } from "@/lib/contracts/trust-exception-approvals";

const now = new Date("2026-05-25T00:00:00.000Z");

function approval(overrides: Partial<TrustExceptionApproval> = {}): TrustExceptionApproval {
  return {
    id: "approval-1",
    organization_id: "org-1",
    contract_id: "approved",
    approved_by_user_id: "reviewer-1",
    approval_type: "low_confidence_evidence",
    approval_reason: "Approved weak evidence risk.",
    source_field_keys: ["notice_deadline_date"],
    evidence_confidence_at_approval: 0.4,
    expires_at: null,
    revoked_at: null,
    revoked_by_user_id: null,
    revocation_reason: null,
    created_at: "2026-05-24T00:00:00.000Z",
    updated_at: "2026-05-24T00:00:00.000Z",
    ...overrides
  };
}

function contract(overrides: Partial<RenewalCommandContractInput> = {}): RenewalCommandContractInput {
  return {
    id: "safe",
    title: "Safe Contract",
    ownerUserId: "owner-1",
    ownerName: "Owner One",
    renewalDate: "2026-08-01",
    noticeDeadlineDate: "2026-07-10",
    autoRenewal: false,
    needsReview: false,
    hasWeakEvidence: false,
    acceptedUnverifiedRiskRequested: false,
    fieldConfidence: {
      renewal_date: 0.9,
      notice_deadline_date: 0.9,
      auto_renewal: 0.9
    },
    contractValueAmount: 10000,
    reminders: [{ status: "scheduled", remind_at: "2026-06-01T00:00:00.000Z" }],
    trustExceptionApprovals: [],
    ...overrides
  };
}

describe("renewal command center", () => {
  it("handles an empty organization", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [],
      now
    });

    expect(center.totalContracts).toBe(0);
    expect(center.overallReadinessScore).toBe(0);
    expect(center.trustedReminderCoverage).toBe(0);
    expect(center.recommendedActions).toEqual([]);
  });

  it("recognizes all-safe contracts and trusted reminder coverage", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [contract()],
      now
    });

    expect(center.riskSegments.find((segment) => segment.id === "safe")?.count).toBe(1);
    expect(center.contractsBlockedFromTrustedReminder).toBe(0);
    expect(center.trustedReminderCoverage).toBe(100);
    expect(center.estimatedSpendAtRisk).toBe(0);
  });

  it("segments missing owner, weak evidence, pending approval, and active approval", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [
        contract({ id: "missing-owner", title: "Missing Owner", ownerUserId: null, ownerName: "Unassigned" }),
        contract({
          id: "weak",
          title: "Weak Evidence",
          hasWeakEvidence: true,
          fieldConfidence: { renewal_date: 0.4, notice_deadline_date: 0.4 },
          reminders: []
        }),
        contract({
          id: "pending",
          title: "Pending Approval",
          hasWeakEvidence: true,
          acceptedUnverifiedRiskRequested: true,
          fieldConfidence: { renewal_date: 0.4, notice_deadline_date: 0.4 },
          reminders: []
        }),
        contract({
          id: "approved",
          title: "Approved Weak Evidence",
          hasWeakEvidence: true,
          acceptedUnverifiedRiskRequested: true,
          fieldConfidence: { renewal_date: 0.4, notice_deadline_date: 0.4 },
          reminders: [],
          trustExceptionApprovals: [approval()]
        })
      ],
      now
    });

    expect(center.contractsMissingOwner).toBe(1);
    expect(center.contractsWithWeakEvidence).toBe(3);
    expect(center.contractsWithPendingTrustApproval).toBe(1);
    expect(center.contractsWithActiveTrustApproval).toBe(1);
    expect(center.riskSegments.find((segment) => segment.id === "missing_owner")?.count).toBe(1);
    expect(center.riskSegments.find((segment) => segment.id === "pending_approval")?.count).toBe(1);
  });

  it("detects upcoming and past notice deadlines plus high-value auto-renew risk", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [
        contract({
          id: "past",
          title: "Past Notice",
          noticeDeadlineDate: "2026-05-01",
          reminders: []
        }),
        contract({
          id: "upcoming",
          title: "Upcoming Notice",
          noticeDeadlineDate: "2026-06-01",
          reminders: []
        }),
        contract({
          id: "high-value",
          title: "High Value Auto Renew",
          autoRenewal: true,
          contractValueAmount: 90000,
          hasWeakEvidence: true,
          fieldConfidence: { renewal_date: 0.4, notice_deadline_date: 0.4 },
          reminders: []
        })
      ],
      now
    });

    expect(center.contractsPastNoticeDeadline).toBe(1);
    expect(center.contractsWithUpcomingNoticeDeadline).toBe(1);
    expect(center.riskSegments.find((segment) => segment.id === "high_value_risk")?.contracts.map((item) => item.id)).toContain("high-value");
    expect(center.estimatedSpendAtRisk).toBeGreaterThanOrEqual(110000);
    expect(center.recommendedActions.at(0)?.id).toBe("resolve_past_notice_deadlines");
  });

  it("feeds Command Center risk into unified decision intelligence without losing existing counts", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [
        contract({
          id: "past",
          title: "Past Notice",
          noticeDeadlineDate: "2026-05-01",
          reminders: []
        }),
        contract({
          id: "weak",
          title: "Weak Evidence",
          hasWeakEvidence: true,
          fieldConfidence: { renewal_date: 0.4, notice_deadline_date: 0.4 },
          reminders: []
        })
      ],
      saasOptOutItems: [
        {
          contractId: "past",
          deadlineWindow: "expired",
          workflowStatus: "needs_review",
          ownerUserId: null,
          spendAtRiskAmount: 45000
        }
      ],
      saasImportReview: {
        latestBatchId: "batch-1",
        needsReviewCount: 2,
        rejectedCount: 1,
        readyCount: 0,
        correctedCount: 0
      },
      now
    });

    expect(center.contractsPastNoticeDeadline).toBe(1);
    expect(center.contractsWithWeakEvidence).toBe(1);
    expect(center.saasOptOutSummary.expiredCount).toBe(1);
    expect(center.saasImportReviewSummary.blockedRowCount).toBe(3);
    expect(center.unifiedIntelligenceSummary.blockedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "import_row_blocked", source: "import_review" })
    ]));
    expect(center.unifiedIntelligenceSummary.recommendedActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "system" })
    ]));
    expect(center.unifiedIntelligenceSummary.trustScore).toBeLessThan(100);
  });

  it("summarizes owner workload and unassigned risk", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [
        contract({ id: "owned", ownerUserId: "owner-1", ownerName: "Owner One" }),
        contract({
          id: "unassigned",
          ownerUserId: null,
          ownerName: "Unassigned",
          contractValueAmount: 30000,
          reminders: []
        })
      ],
      now
    });

    expect(center.unassignedContracts).toBe(1);
    expect(center.unassignedSpendAtRisk).toBe(30000);
    expect(center.ownerWorkload.find((owner) => owner.ownerUserId === null)).toEqual(
      expect.objectContaining({
        blockedCount: 1,
        estimatedSpendAtRisk: 30000
      })
    );
  });

  it("filters by segment for query-param drilldowns", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [contract({ id: "weak", hasWeakEvidence: true, fieldConfidence: { renewal_date: 0.4 } })],
      segment: "weak_evidence",
      now
    });

    expect(center.filteredSegment?.id).toBe("weak_evidence");
    expect(center.filteredSegment?.contracts.map((item) => item.id)).toEqual(["weak"]);
  });

  it("exposes gate-clear contracts as a real reminder activation segment", () => {
    const center = buildRenewalCommandCenter({
      organizationId: "org-1",
      contracts: [contract({ id: "ready", reminders: [] })],
      segment: "ready_for_reminder",
      now
    });

    expect(center.filteredSegment?.contracts.map((item) => item.id)).toEqual(["ready"]);
    expect(center.recommendedActions.find((action) => action.id === "activate_trusted_reminders")).toEqual(
      expect.objectContaining({
        targetHref: "/dashboard?segment=ready_for_reminder"
      })
    );
  });
});

describe("renewal command actions", () => {
  it("prioritizes past notice deadlines over weak evidence and missing owners", () => {
    const actions = buildRenewalCommandActions({
      pastNoticeDeadlineContractIds: ["past"],
      upcomingNoticeDeadlineContractIds: [],
      missingOwnerContractIds: ["missing-owner"],
      missingNoticeDeadlineContractIds: [],
      weakEvidenceContractIds: ["weak"],
      pendingApprovalContractIds: [],
      reminderReadyContractIds: [],
      highValueAutoRenewRiskContractIds: [],
      spendByContractId: {
        past: 1000,
        "missing-owner": 50000,
        weak: 90000
      }
    });

    expect(actions.at(0)?.id).toBe("resolve_past_notice_deadlines");
  });

  it("generates approval and reminder activation actions only for matching queues", () => {
    const actions = buildRenewalCommandActions({
      pastNoticeDeadlineContractIds: [],
      upcomingNoticeDeadlineContractIds: [],
      missingOwnerContractIds: [],
      missingNoticeDeadlineContractIds: [],
      weakEvidenceContractIds: [],
      pendingApprovalContractIds: ["pending"],
      reminderReadyContractIds: ["ready"],
      highValueAutoRenewRiskContractIds: [],
      spendByContractId: {
        pending: 25000,
        ready: 5000
      }
    });

    expect(actions.map((action) => action.id)).toEqual([
      "approve_pending_trust_exceptions",
      "activate_trusted_reminders"
    ]);
  });
});
