import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const currentScopeDocs = [
  "README.md",
  "SHIPPED_FIRST_SCOPE.md",
  "SHIPPED_KERNEL.md",
  "EARLY_OBJECT_MODEL.md",
  "EARLY_RBAC.md",
  "PHASE1_DEFINITION_OF_DONE.md",
  "RELEASE_QUALITY_GATES.md",
  path.join("docs", "CURRENT_PRODUCT_TRUTH.md"),
  path.join("e2e", "README.md"),
];

const forbiddenPhrases = [
  "Slack",
  "Teams",
  "PayPal",
  "Stripe",
  "monthly digest",
  "playbook",
  "custom reminder rule",
  "native calendar sync",
  "retention health",
  "advanced governance",
  "profitability",
  "capacity scoring",
];

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("current product truth docs", () => {
  it("keeps current-scope docs free of deferred feature language", () => {
    for (const docPath of currentScopeDocs) {
      const content = readRepoFile(docPath);

      for (const phrase of forbiddenPhrases) {
        expect(content, `${docPath} should not contain ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it("keeps future-facing material isolated under docs/reference", () => {
    const futureIndex = readRepoFile(path.join("docs", "FUTURE_REFERENCE_INDEX.md"));

    expect(futureIndex).toContain("docs/reference/future");
    expect(futureIndex).toContain("docs/reference/legacy");
    expect(futureIndex).toContain("docs/reference/founder-operating-system");
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "future"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "legacy"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "founder-operating-system"))).toBe(true);
  });
});
