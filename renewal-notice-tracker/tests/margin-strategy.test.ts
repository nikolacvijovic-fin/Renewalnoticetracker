import { describe, expect, it } from "vitest";
import { costStructureRisks, marginAnalysis } from "@/lib/commercial/margin";

describe("margin strategy", () => {
  it("defines the biggest cost leaks and margin-destructive customers", () => {
    expect(marginAnalysis.biggestCostLeaks.length).toBeGreaterThan(0);
    expect(marginAnalysis.marginDestructiveCustomers.some((item) => item.includes("Tiny accounts"))).toBe(
      true
    );
  });

  it("covers the expected cost risk categories", () => {
    expect(costStructureRisks.some((risk) => risk.area === "ai_extraction_cost")).toBe(true);
    expect(costStructureRisks.some((risk) => risk.area === "custom_work_risk")).toBe(true);
  });
});
