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

describe("legacy billing dependency boundary", () => {
  it("keeps shipped runtime free of legacy billing provider imports", () => {
    const forbiddenPatterns = [
      /from\s+["']@\/legacy\/billing\//,
      /import\s+["']@\/legacy\/billing\//,
      /from\s+["']stripe["']/,
      /import\s+["']stripe["']/
    ];

    for (const filePath of shippedRoots.flatMap((root) => walkFiles(root))) {
      const content = fs.readFileSync(filePath, "utf8");
      for (const pattern of forbiddenPatterns) {
        expect(
          content,
          `${path.relative(repoRoot, filePath)} matched forbidden legacy billing pattern ${pattern}`
        ).not.toMatch(pattern);
      }
    }
  });

  it("removes stripe from the shipped dependency manifest", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.stripe).toBeUndefined();
  });
});
