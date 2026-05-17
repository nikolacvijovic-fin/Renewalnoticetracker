import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scorecardPath = path.join(repoRoot, "docs", "NOTICECONTROL_11_10_SCORECARD.md");

const requiredAreas = [
  "Scope Purity",
  "Deferred Isolation",
  "Active-Org Safety",
  "Action-Level RBAC",
  "P0 Review Trust",
  "Reminder Gating",
  "Reminder Reliability Visibility",
  "Email Safety",
  "Import Honesty",
  "Counterparty Normalization",
  "Billing Purity",
  "Internal Ops Minimalism",
  "Analytics Minimalism",
  "Release-Critical Proof",
  "Founder-Autonomy Gate"
];

const requiredFieldLabels = [
  "Current status:",
  "Pass condition:",
  "Blocking tests:",
  "Owning files:",
  "What is not allowed:"
];

describe("NoticeControl 11/10 scorecard", () => {
  it("exists and references every required shipped-kernel area", () => {
    expect(fs.existsSync(scorecardPath)).toBe(true);
    const content = fs.readFileSync(scorecardPath, "utf8");

    for (const area of requiredAreas) {
      expect(content).toContain(`## ${area}`);
    }
  });

  it("uses evidence fields for every required area", () => {
    const content = fs.readFileSync(scorecardPath, "utf8");

    for (const area of requiredAreas) {
      const start = content.indexOf(`## ${area}`);
      expect(start).toBeGreaterThanOrEqual(0);

      const nextHeadingIndex = requiredAreas
        .map((candidate) => content.indexOf(`## ${candidate}`, start + 1))
        .filter((index) => index > start)
        .sort((a, b) => a - b)[0] ?? content.length;

      const section = content.slice(start, nextHeadingIndex);

      for (const label of requiredFieldLabels) {
        expect(section, `${area} should include ${label}`).toContain(label);
      }
    }
  });

  it("does not let any area claim 11/10 without evidence language", () => {
    const content = fs.readFileSync(scorecardPath, "utf8");

    expect(content).toContain("no area counts as `11/10` without code, docs, and blocking tests that prove it");
    expect(content).toContain("no section claims `11/10` from narrative alone");
  });
});
