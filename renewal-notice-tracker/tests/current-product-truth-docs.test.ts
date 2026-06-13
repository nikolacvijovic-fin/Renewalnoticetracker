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
  "monthly digest",
  "playbook",
  "custom reminder rule",
  "native calendar sync",
  "retention health",
  "advanced governance",
  "profitability",
  "capacity scoring",
];

const forbiddenBillingScopePhrases = [
  "PayPal optional",
  "PayPal public self-serve",
  "PayPal checkout parity",
  "PayPal as an active customer billing provider",
  "Stripe as an active customer billing provider",
  "Stripe checkout parity",
  "provider parity"
];

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walkMarkdownFiles(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root);
  const entries = fs.readdirSync(absoluteRoot, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const relativePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkMarkdownFiles(relativePath);
    }

    return entry.isFile() && entry.name.endsWith(".md") ? [relativePath] : [];
  });
}

describe("current product truth docs", () => {
  it("keeps current-scope docs free of deferred feature language", () => {
    for (const docPath of currentScopeDocs) {
      const content = readRepoFile(docPath);

      for (const phrase of forbiddenPhrases) {
        expect(content, `${docPath} should not contain ${phrase}`).not.toContain(phrase);
      }

      for (const phrase of forbiddenBillingScopePhrases) {
        expect(content, `${docPath} should not contain ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it("keeps future-facing material isolated under docs/reference", () => {
    const futureIndex = readRepoFile(path.join("docs", "FUTURE_REFERENCE_INDEX.md"));

    expect(futureIndex).toContain("reference/future");
    expect(futureIndex).toContain("reference/legacy");
    expect(futureIndex).toContain("reference/founder-operating-system");
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "future"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "legacy"))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, "docs", "reference", "founder-operating-system"))).toBe(true);
  });

  it("keeps repository documentation free of machine-local absolute paths", () => {
    const docs = [
      ...fs
        .readdirSync(repoRoot)
        .filter((entry) => entry.endsWith(".md")),
      ...walkMarkdownFiles("docs")
    ];
    const forbiddenLocalPathPatterns = [/C:\/Users\//, /C:\\Users\\/, /\/Users\//, /\/home\//];

    for (const docPath of docs) {
      const content = readRepoFile(docPath);

      for (const pattern of forbiddenLocalPathPatterns) {
        expect(content, `${docPath} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
