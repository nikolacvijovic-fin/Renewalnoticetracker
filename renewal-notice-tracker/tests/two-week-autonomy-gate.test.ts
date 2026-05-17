import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getMissingTwoWeekAutonomyChecklist } from "@/scripts/phase1-release-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("two-week autonomy gate doc", () => {
  it("defines the operator autonomy checklist and hidden-rescue blockers", () => {
    const docPath = path.join(repoRoot, "docs", "TWO_WEEK_AUTONOMY_GATE.md");
    expect(fs.existsSync(docPath)).toBe(true);

    const content = fs.readFileSync(docPath, "utf8");
    expect(getMissingTwoWeekAutonomyChecklist(content)).toEqual([]);
  });
});
