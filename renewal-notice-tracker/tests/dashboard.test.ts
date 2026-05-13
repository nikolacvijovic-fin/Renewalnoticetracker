import { describe, expect, it } from "vitest";
import {
  calculateDashboardMetrics,
  filterContractsForDashboard
} from "@/lib/contracts/dashboard";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

const rows: DashboardContractRow[] = [
  {
    status: "needs_review",
    status_tag: "active",
    contract_metadata: {
      expiration_date: "2099-01-10T00:00:00.000Z",
      notice_deadline_date: "2099-01-05T00:00:00.000Z",
      auto_renewal: true,
      needs_review: true
    }
  },
  {
    status: "reminders_scheduled",
    status_tag: "terminated",
    contract_metadata: {
      expiration_date: "2099-04-10T00:00:00.000Z",
      notice_deadline_date: null,
      auto_renewal: false,
      needs_review: false
    }
  }
];

describe("dashboard helpers", () => {
  it("calculates operational metrics", () => {
    const metrics = calculateDashboardMetrics(rows);
    expect(metrics.totalContracts).toBe(2);
    expect(metrics.needsReview).toBe(1);
    expect(metrics.renewalsDueSoon).toBeGreaterThanOrEqual(0);
  });

  it("filters contracts for dashboard buckets", () => {
    expect(filterContractsForDashboard(rows, "needs_review")).toHaveLength(1);
    expect(filterContractsForDashboard(rows, "auto_renewal")).toHaveLength(1);
    expect(filterContractsForDashboard(rows, "active")).toHaveLength(1);
  });
});
