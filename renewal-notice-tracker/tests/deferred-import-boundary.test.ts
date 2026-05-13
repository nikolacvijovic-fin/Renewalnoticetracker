import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shippedRoots = [
  path.join(repoRoot, "app"),
  path.join(repoRoot, "components"),
  path.join(repoRoot, "lib")
];

const allowedFiles = new Set([
  path.join(repoRoot, "lib", "product", "deferred-capabilities.ts")
]);

function walkFiles(root: string, files: string[] = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (
        fullPath.startsWith(path.join(repoRoot, "lib", "commercial")) ||
        fullPath.startsWith(path.join(repoRoot, "lib", "internal"))
      ) {
        continue;
      }
      walkFiles(fullPath, files);
      continue;
    }

    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (allowedFiles.has(fullPath)) continue;
    files.push(fullPath);
  }

  return files;
}

const forbiddenImportPatterns = [
  /from\s+["']@\/deferred\//,
  /from\s+["']@\/legacy\//,
  /from\s+["']@\/docs\/reference\//,
  /import\s+["']@\/deferred\//,
  /import\s+["']@\/legacy\//,
  /import\s+["']@\/docs\/reference\//
];

describe("deferred import boundary", () => {
  it("prevents shipped runtime from importing deferred, docs/reference, or legacy modules", () => {
    for (const filePath of shippedRoots.flatMap((root) => walkFiles(root))) {
      const content = fs.readFileSync(filePath, "utf8");

      for (const pattern of forbiddenImportPatterns) {
        expect(
          content,
          `${path.relative(repoRoot, filePath)} matched forbidden import ${pattern}`
        ).not.toMatch(pattern);
      }
    }
  });

  it("keeps preserved deferred modules in powerless locations", () => {
    const expectedPaths = [
      path.join(repoRoot, "deferred", "components", "contracts", "playbook-form.tsx"),
      path.join(repoRoot, "deferred", "components", "contracts", "reminder-rule-form.tsx"),
      path.join(repoRoot, "deferred", "components", "dashboard", "retention-health-panel.tsx"),
      path.join(repoRoot, "deferred", "contracts", "template-reminder-offsets.ts"),
      path.join(repoRoot, "deferred", "integrations", "slack.ts"),
      path.join(repoRoot, "deferred", "integrations", "teams.ts"),
      path.join(repoRoot, "deferred", "email", "send-digest.ts"),
      path.join(repoRoot, "deferred", "analytics", "advanced-analytics.ts"),
      path.join(repoRoot, "legacy", "billing", "providers", "paypal.ts"),
      path.join(repoRoot, "legacy", "billing", "providers", "stripe-legacy.ts")
    ];

    for (const target of expectedPaths) {
      expect(fs.existsSync(target), `${path.relative(repoRoot, target)} should exist`).toBe(true);
    }
  });
});
