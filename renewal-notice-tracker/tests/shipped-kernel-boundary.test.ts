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

const excludedPathSegments = [
  `${path.sep}app${path.sep}internal${path.sep}`,
  `${path.sep}app${path.sep}api${path.sep}internal${path.sep}`,
  `${path.sep}components${path.sep}admin${path.sep}`,
  `${path.sep}deferred${path.sep}`,
  `${path.sep}lib${path.sep}commercial${path.sep}`,
  `${path.sep}lib${path.sep}internal${path.sep}`,
  `${path.sep}lib${path.sep}product${path.sep}`
];

const excludedExactFiles = new Set([
  path.join(repoRoot, "lib", "contracts", "queries.ts"),
  path.join(repoRoot, "app", "api", "cron", "monthly-digest", "route.ts")
]);

const forbiddenPatterns = [
  /from\s+["']@\/deferred\//,
  /from\s+["']@\/lib\/contracts\/queries["']/,
  /from\s+["']@\/lib\/commercial\/(?:retention|strategy|packaging|blueprint|breadth-register|support-economics|organization-health|readiness[^"']*|capacity[^"']*|metric-alerts|ops-metrics)/,
  /monthly digest/i,
  /Slack and Teams delivery/i
];

function walkFiles(root: string, filePaths: string[] = []) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, filePaths);
      continue;
    }

    if (!/\.(ts|tsx|md)$/.test(entry.name)) continue;
    if (excludedExactFiles.has(fullPath)) continue;
    if (excludedPathSegments.some((segment) => fullPath.includes(segment))) continue;
    filePaths.push(fullPath);
  }

  return filePaths;
}

describe("shipped kernel boundary", () => {
  it("does not import deferred or oversized internal capability modules", () => {
    for (const filePath of shippedRoots.flatMap((root) => walkFiles(root))) {
      const contents = fs.readFileSync(filePath, "utf8");

      for (const pattern of forbiddenPatterns) {
        expect(contents, `${path.relative(repoRoot, filePath)} matched ${pattern}`).not.toMatch(
          pattern
        );
      }
    }
  });
});
