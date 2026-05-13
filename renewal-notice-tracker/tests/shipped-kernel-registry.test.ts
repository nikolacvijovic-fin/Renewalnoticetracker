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
    expect(SHIPPED_KERNEL.routes).toContain("/dashboard/contracts/[id]");
    expect(SHIPPED_KERNEL.components).toContain("ReviewForm");
    expect(SHIPPED_KERNEL.components).toContain("ContractWorkflowSummary");
    expect(SHIPPED_KERNEL.components).not.toContain("ReminderForm");
    expect(SHIPPED_KERNEL.actions).toContain("updateContractReviewAction");
    expect(SHIPPED_KERNEL.actions).not.toContain("createReminderAction");
    expect(SHIPPED_KERNEL.apis).toContain("/api/reminders");
    expect(SHIPPED_KERNEL.reports).toEqual([
      "reviewed_coverage",
      "owner_coverage",
      "due_soon_exposure",
      "decision_gaps"
    ]);
  });
});
