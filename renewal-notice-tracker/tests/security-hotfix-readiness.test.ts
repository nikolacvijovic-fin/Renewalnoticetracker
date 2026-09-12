import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());

function isPatchedNextVersion(version: string) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  if (major === 15) return minor > 5 || (minor === 5 && patch >= 24);
  if (major === 16) return minor > 3 || (minor === 3 && patch >= 3);
  return major > 16;
}

function runtimeSource(root: string) {
  const files: string[] = [];
  const visit = (directory: string) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (/\.(?:ts|tsx|js|mjs)$/.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };

  for (const directory of ["app", "lib", "legacy"]) {
    visit(path.join(root, directory));
  }

  return files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
}

describe("August 2026 security hotfix readiness", () => {
  it("pins a patched Next.js release and matching lint rules", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const lockfile = JSON.parse(fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"));
    const declaredNext = packageJson.dependencies?.next ?? "";
    const declaredEslintConfig = packageJson.devDependencies?.["eslint-config-next"] ?? "";
    const lockedNext = lockfile.packages?.["node_modules/next"]?.version ?? "";

    expect(declaredNext).toBe("15.5.24");
    expect(declaredEslintConfig).toBe(declaredNext);
    expect(lockedNext).toBe(declaredNext);
    expect(isPatchedNextVersion(lockedNext)).toBe(true);
  });

  it("does not enable AVIF or attacker-controlled remote image optimization", () => {
    const nextConfig = fs.readFileSync(path.join(repoRoot, "next.config.mjs"), "utf8");

    expect(nextConfig).not.toMatch(/image\/avif/i);
    expect(nextConfig).not.toMatch(/remotePatterns\s*:/);
    expect(nextConfig).not.toMatch(/loader\s*:/);
  });

  it("keeps the retired Assistants API out of runtime code", () => {
    const source = runtimeSource(repoRoot);
    const retiredPatterns = [
      /beta\.assistants/i,
      /\/v1\/assistants/i,
      /\.threads\.create\s*\(/i,
      /\.runs\.create\s*\(/i,
      /createThreadAndRun/i
    ];

    for (const pattern of retiredPatterns) {
      expect(source).not.toMatch(pattern);
    }
  });
});
