import { describe, expect, it } from "vitest";
import { channelEconomics, unitEconomicsAnalysis, unitEconomicsSegments } from "@/lib/commercial/unit-economics";

describe("unit economics strategy", () => {
  it("defines an economically best target segment", () => {
    const bestSegment = unitEconomicsSegments.find((segment) => segment.economicQuality === "best");

    expect(bestSegment?.name).toBe("Midsize Ops-Led");
    expect(unitEconomicsAnalysis.bestTargetSegmentEconomically).toContain("50-500 employee");
  });

  it("flags broad paid acquisition as a high-risk channel", () => {
    const paidChannel = channelEconomics.find((channel) => channel.channel === "Broad paid acquisition");

    expect(paidChannel?.paybackRisk).toBe("High");
  });
});
