import { describe, expect, it } from "vitest";
import { redTeamAnalysis, redTeamRisks } from "@/lib/commercial/red-team";

describe("red team profitability review", () => {
  it("calls out the top mistake risks", () => {
    expect(redTeamAnalysis.topMistakesBeingRisked).toHaveLength(10);
    expect(redTeamAnalysis.topMistakesBeingRisked).toContain("Letting services become custom consulting");
  });

  it("includes skeptical profitability risks", () => {
    expect(redTeamRisks.length).toBeGreaterThan(0);
    expect(redTeamAnalysis.brutalCritique).toContain("impressive");
  });
});
