import { describe, expect, it, vi } from "vitest";
import {
  evaluateOutreachSafety,
  hashContactIdentifier,
  isSuppressionActive
} from "@/lib/internal-outreach-intelligence/outreach-safety";

describe("internal outreach suppression", () => {
  it("treats unexpired suppressions as active safety blockers", () => {
    vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
    try {
      const active = {
        expires_at: "2030-02-01T00:00:00.000Z"
      };
      const expired = {
        expires_at: "2029-12-01T00:00:00.000Z"
      };

      expect(isSuppressionActive(active)).toBe(true);
      expect(isSuppressionActive(expired)).toBe(false);
      expect(
        evaluateOutreachSafety({
          audience: "procurement",
          draftText: "Internal draft for review",
          suppressions: [active as any]
        })
      ).toEqual(expect.objectContaining({
        safetyStatus: "blocked",
        safetyReasons: ["active_suppression"]
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores suppression targets as stable hashes instead of raw contact identifiers", () => {
    const hash = hashContactIdentifier("Buyer@Vendor.example");

    expect(hash).toBe(hashContactIdentifier(" buyer@vendor.example "));
    expect(hash).not.toContain("Buyer");
    expect(hash).not.toContain("@");
    expect(hash).toHaveLength(64);
  });
});
