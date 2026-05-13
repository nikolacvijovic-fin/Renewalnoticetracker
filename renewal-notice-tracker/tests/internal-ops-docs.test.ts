import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

describe("internal ops docs", () => {
  it("keeps runtime internal ops focused on operational rescue only", () => {
    const scope = readFileSync(join(root, "docs", "reference", "founder-operating-system", "INTERNAL_OPS_SCOPE.md"), "utf8");
    const notForRuntime = readFileSync(join(root, "docs", "reference", "founder-operating-system", "INTERNAL_OPS_NOT_FOR_RUNTIME.md"), "utf8");

    expect(scope).toContain("reminder processing status");
    expect(scope).toContain("failed reminders");
    expect(scope).toContain("billing exceptions");
    expect(notForRuntime).toContain("readiness scoring");
    expect(notForRuntime).toContain("profitability blueprints");
    expect(notForRuntime).toContain("analytics architecture");
  });
});
