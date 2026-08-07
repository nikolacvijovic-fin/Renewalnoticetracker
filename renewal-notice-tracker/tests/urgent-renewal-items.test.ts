import { describe, expect, it } from "vitest";
import { buildUrgentRenewalDashboard } from "@/lib/dashboard/urgent-renewal-items";
import type { RenewalCommandContractInput } from "@/lib/dashboard/renewal-command-center";

const now = new Date("2026-08-07T12:00:00.000Z");

function contract(overrides: Partial<RenewalCommandContractInput> = {}): RenewalCommandContractInput {
  return {
    id: "base",
    title: "Base Contract",
    counterpartyName: "Base Vendor",
    status: "active",
    statusTag: "active",
    cycleStatus: "active",
    ownerUserId: "owner-1",
    ownerName: "Owner One",
    noticeDeadlineDate: "2026-09-30",
    renewalDate: "2026-10-30",
    expirationDate: "2026-10-30",
    autoRenewal: true,
    needsReview: false,
    hasWeakEvidence: false,
    fieldConfidence: {
      notice_deadline_date: 0.95,
      renewal_date: 0.95,
      auto_renewal: 0.95
    },
    contractValueAmount: 10000,
    contractValueCurrency: "USD",
    reminders: [],
    ...overrides
  };
}

describe("urgent renewal dashboard", () => {
  it("sorts urgent items by missed, today, week, month, spend, owner, weak deadline, then review", () => {
    const dashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "needs-review",
          title: "Needs Review",
          noticeDeadlineDate: "2026-11-01",
          needsReview: true
        }),
        contract({
          id: "missing-owner",
          title: "Missing Owner",
          noticeDeadlineDate: "2026-11-01",
          ownerUserId: null,
          ownerName: "Unassigned"
        }),
        contract({
          id: "high-spend",
          title: "High Spend",
          noticeDeadlineDate: "2026-11-01",
          contractValueAmount: 90000
        }),
        contract({
          id: "month",
          title: "Month",
          noticeDeadlineDate: "2026-08-30"
        }),
        contract({
          id: "week",
          title: "Week",
          noticeDeadlineDate: "2026-08-12"
        }),
        contract({
          id: "today",
          title: "Today",
          noticeDeadlineDate: "2026-08-07"
        }),
        contract({
          id: "missed",
          title: "Missed",
          noticeDeadlineDate: "2026-08-01"
        }),
        contract({
          id: "weak-deadline",
          title: "Weak Deadline",
          noticeDeadlineDate: "2026-08-10",
          needsReview: true,
          hasWeakEvidence: true,
          fieldConfidence: {
            notice_deadline_date: 0.4
          }
        })
      ]
    });

    expect(dashboard.allActionItems.map((item) => item.contractId)).toEqual([
      "missed",
      "today",
      "week",
      "month",
      "high-spend",
      "missing-owner",
      "weak-deadline",
      "needs-review"
    ]);
    expect(dashboard.topUrgentItems).toHaveLength(5);
  });

  it("uses high spend as a deterministic tie-breaker inside the same urgency bucket", () => {
    const dashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "lower-spend",
          title: "Lower Spend",
          noticeDeadlineDate: "2026-08-20",
          contractValueAmount: 30000
        }),
        contract({
          id: "higher-spend",
          title: "Higher Spend",
          noticeDeadlineDate: "2026-08-20",
          contractValueAmount: 100000
        })
      ]
    });

    expect(dashboard.allActionItems.map((item) => item.contractId)).toEqual([
      "higher-spend",
      "lower-spend"
    ]);
  });

  it("marks weak or unreviewed notice deadlines as review blockers, not trusted deadline urgency", () => {
    const dashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "weak",
          title: "Weak Date",
          noticeDeadlineDate: "2026-08-08",
          needsReview: true,
          hasWeakEvidence: true,
          fieldConfidence: {
            notice_deadline_date: 0.3
          }
        })
      ]
    });

    expect(dashboard.allActionItems[0]).toEqual(expect.objectContaining({
      contractId: "weak",
      trustStatus: "needs_review",
      daysLeft: null,
      primaryReason: "missing_or_weak_notice_deadline"
    }));
    expect(dashboard.summary.urgentThisWeek).toBe(0);
    expect(dashboard.summary.needsReview).toBe(1);
  });

  it("counts missing deadlines, unassigned owners, spend at risk, and review states", () => {
    const dashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "missing-date",
          title: "Missing Date",
          noticeDeadlineDate: null,
          contractValueAmount: 45000
        }),
        contract({
          id: "unassigned",
          title: "Unassigned",
          ownerUserId: null,
          noticeDeadlineDate: "2026-08-09",
          contractValueAmount: 20000
        }),
        contract({
          id: "review",
          title: "Review",
          needsReview: true,
          noticeDeadlineDate: "2026-10-01",
          contractValueAmount: 15000
        })
      ]
    });

    expect(dashboard.summary).toEqual(expect.objectContaining({
      urgentThisWeek: 1,
      dueThisMonth: 1,
      missingNoticeDeadlines: 1,
      needsReview: 1,
      unassignedOwners: 1,
      spendAtRiskAmount: 80000
    }));
  });

  it("does not show resolved or archived contracts as urgent", () => {
    const dashboard = buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "resolved",
          title: "Resolved",
          cycleStatus: "resolved",
          noticeDeadlineDate: "2026-08-01"
        }),
        contract({
          id: "archived",
          title: "Archived",
          status: "archived",
          noticeDeadlineDate: "2026-08-01"
        }),
        contract({
          id: "active",
          title: "Active",
          noticeDeadlineDate: "2026-08-01"
        })
      ]
    });

    expect(dashboard.allActionItems.map((item) => item.contractId)).toEqual(["active"]);
    expect(dashboard.summary.missedDeadlines).toBe(1);
  });

  it("reports useful empty and good states", () => {
    expect(buildUrgentRenewalDashboard({ now, contracts: [] }).emptyState).toBe("no_contracts");
    expect(buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "missing-all",
          noticeDeadlineDate: null,
          renewalDate: null,
          expirationDate: null
        })
      ]
    }).emptyState).toBe("all_missing_metadata");
    expect(buildUrgentRenewalDashboard({
      now,
      contracts: [
        contract({
          id: "clear",
          noticeDeadlineDate: "2026-12-01",
          contractValueAmount: 1000
        })
      ]
    }).emptyState).toBe("all_clear");
  });
});
