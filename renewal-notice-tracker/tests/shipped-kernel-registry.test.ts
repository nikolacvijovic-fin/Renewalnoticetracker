import { describe, expect, it } from "vitest";
import { SHIPPED_KERNEL } from "@/lib/product/shipped-kernel";

describe("shipped kernel registry", () => {
  it("captures the single shipped workflow and its runtime surfaces", () => {
    expect(SHIPPED_KERNEL.workflowLoop).toEqual([
      "upload_or_import",
      "review_p0",
      "assign_owner",
      "trusted_reminder",
      "acknowledgment",
      "decision",
      "closure"
    ]);
    expect(SHIPPED_KERNEL.routes).toContain("/dashboard/risk-queue");
    expect(SHIPPED_KERNEL.routes).toContain("/dashboard/financial-intelligence");
    expect(SHIPPED_KERNEL.routes).toContain("/dashboard/procurement-analytics");
    expect(SHIPPED_KERNEL.routes).toContain("/dashboard/contracts/[id]");
    expect(SHIPPED_KERNEL.components).toContain("ReviewForm");
    expect(SHIPPED_KERNEL.components).toContain("ContractWorkflowSummary");
    expect(SHIPPED_KERNEL.components).toContain("RiskBadge");
    expect(SHIPPED_KERNEL.components).toContain("RiskExplanationDrawer");
    expect(SHIPPED_KERNEL.components).toContain("RiskQueueTable");
    expect(SHIPPED_KERNEL.components).toContain("FinancialExposureCard");
    expect(SHIPPED_KERNEL.components).toContain("ProcurementActionList");
    expect(SHIPPED_KERNEL.components).not.toContain("ReminderForm");
    expect(SHIPPED_KERNEL.actions).toContain("updateContractReviewAction");
    expect(SHIPPED_KERNEL.actions).not.toContain("createReminderAction");
    expect(SHIPPED_KERNEL.apis).toContain("/api/reminders");
    expect(SHIPPED_KERNEL.reports).toEqual([
      "reviewed_coverage",
      "owner_coverage",
      "due_soon_exposure",
      "decision_gaps",
      "renewal_exposure_30_60_90_180_days",
      "auto_renewal_exposure",
      "unowned_exposure",
      "undecided_exposure",
      "unreviewed_exposure",
      "price_change_exposure",
      "cfo_opt_out_clock",
      "saas_opt_out_urgency",
      "saas_contract_risk_findings",
      "exposure_by_counterparty",
      "exposure_by_department",
      "exposure_by_owner",
      "top_vendors_by_upcoming_renewal_exposure",
      "vendor_contracts_due_soon",
      "owner_gaps_by_department",
      "decision_gaps_by_owner",
      "auto_renewals_needing_decision",
      "duplicate_counterparty_cleanup",
      "renewal_outcome_history"
    ]);
  });
});
