import { describe, expect, it } from "vitest";
import { gtmAnalysis } from "@/lib/commercial/gtm";

describe("gtm strategy", () => {
  it("keeps the GTM motion narrow and profitable", () => {
    expect(gtmAnalysis.motionRecommendation).toContain("hybrid");
    expect(gtmAnalysis.mostProfitableIcp).toContain("50-500 employees");
  });

  it("flags broad paid acquisition as weak", () => {
    expect(gtmAnalysis.weakChannels.some((channel) => channel.includes("Broad paid acquisition"))).toBe(
      true
    );
  });
});
