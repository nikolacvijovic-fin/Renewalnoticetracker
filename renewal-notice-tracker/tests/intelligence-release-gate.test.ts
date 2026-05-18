import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_RELEASE_BLOCKERS,
  INTELLIGENCE_RELEASE_GATE_TEST_FILES,
  INTELLIGENCE_RELEASE_REQUIRED_DOCS,
  INTELLIGENCE_ROUTE_FILES,
  getMissingGateTestFiles,
  getMissingIntelligenceDocPaths,
  getMissingReleaseBlockers
} from "@/scripts/intelligence-release-gates.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("intelligence release gate", () => {
  it("keeps the required intelligence gate docs present and complete", () => {
    const markdownFiles = collectMarkdownFiles(path.join(repoRoot, "docs", "intelligence")).map((file) =>
      path.relative(repoRoot, file).replaceAll("\\", "/")
    );

    expect(getMissingIntelligenceDocPaths(markdownFiles)).toEqual([]);

    for (const relativePath of INTELLIGENCE_RELEASE_REQUIRED_DOCS) {
      const content = readRepoFile(relativePath);
      if (relativePath.endsWith("INTELLIGENCE_RELEASE_GATE.md")) {
        expect(getMissingReleaseBlockers(content)).toEqual([]);
      }
    }
  });

  it("wires a dedicated intelligence gate script and CI step", () => {
    const packageJson = JSON.parse(readRepoFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const gateScript = packageJson.scripts?.["test:intelligence-release-gate"] ?? "";

    expect(gateScript).toBeTruthy();
    expect(getMissingGateTestFiles(gateScript)).toEqual([]);

    const workflow = readRepoFile(".github/workflows/release-readiness.yml");
    expect(workflow).toContain("Run intelligence release gate");
    expect(workflow).toContain("npm run test:intelligence-release-gate");
  });

  it("keeps route-level org, role, and plan gates on all intelligence pages", () => {
    for (const relativePath of INTELLIGENCE_ROUTE_FILES) {
      const content = readRepoFile(relativePath);
      expect(content).toContain("requireOrganization");
      expect(content).toContain("getBillingSnapshot");
      expect(content).toContain("assertCanAccessIntelligenceSurface");
    }
  });

  it("documents every required release blocker", () => {
    const releaseGate = readRepoFile("docs/intelligence/INTELLIGENCE_RELEASE_GATE.md").toLowerCase();
    const testMatrix = readRepoFile("docs/intelligence/INTELLIGENCE_TEST_MATRIX.md").toLowerCase();
    const riskRegister = readRepoFile("docs/intelligence/INTELLIGENCE_RISK_REGISTER.md").toLowerCase();

    for (const blocker of INTELLIGENCE_RELEASE_BLOCKERS) {
      expect(releaseGate).toContain(blocker);
      expect(testMatrix).toContain(blocker);
      expect(riskRegister).toContain(blocker);
    }
  });

  it("keeps the intelligence gate focused on traceability, drilldowns, and safe copy", () => {
    const gateScript = JSON.parse(readRepoFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const intelligenceReleaseGate = gateScript.scripts?.["test:intelligence-release-gate"] ?? "";

    expect(intelligenceReleaseGate).toContain("tests/financial-exposure.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/risk-score.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/procurement-query-helpers.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/intelligence-access.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/risk-explanation-drawer.test.tsx");
    expect(INTELLIGENCE_RELEASE_GATE_TEST_FILES).toContain("tests/risk-explanation-drawer.test.tsx");
  });
});

function collectMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}
