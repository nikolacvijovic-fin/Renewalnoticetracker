import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("release script boundary", () => {
  it("keeps release-critical focused on the shipped loop and moves future suites out", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
    ) as {
      scripts?: Record<string, string>;
    };

    const releaseCritical = packageJson.scripts?.["test:release-critical"] ?? "";
    const intelligenceReleaseGate = packageJson.scripts?.["test:intelligence-release-gate"] ?? "";
    const futureReference = packageJson.scripts?.["test:future-reference"] ?? "";

    expect(releaseCritical).toContain("test:release-critical:session-org");
    expect(releaseCritical).toContain("test:release-critical:authz");
    expect(releaseCritical).toContain("test:release-critical:intake-review");
    expect(releaseCritical).toContain("test:release-critical:workflow");
    expect(releaseCritical).toContain("test:release-critical:exports");
    expect(releaseCritical).toContain("test:release-critical:billing");

    expect(releaseCritical).not.toContain("test:scope-freeze");
    expect(releaseCritical).not.toContain("test:ops-readiness");
    expect(releaseCritical).not.toContain("test:analytics-runtime");
    expect(releaseCritical).not.toContain("test:privacy-ops");
    expect(releaseCritical).not.toContain("test:deletion-control-plane");
    expect(releaseCritical).not.toContain("tests/monthly-digest-route.test.ts");
    expect(releaseCritical).not.toContain("tests/support-economics.test.ts");
    expect(releaseCritical).not.toContain("tests/conversion-strategy.test.ts");
    expect(releaseCritical).not.toContain("tests/red-team-strategy.test.ts");
    expect(releaseCritical).not.toContain("tests/unified-blueprint.test.ts");
    expect(releaseCritical).not.toContain("test:intelligence-release-gate");
    expect(releaseCritical).not.toContain("tests/intelligence-access.test.ts");
    expect(releaseCritical).not.toContain("tests/financial-intelligence-page.test.tsx");
    expect(releaseCritical).not.toContain("tests/procurement-analytics-page.test.tsx");
    expect(releaseCritical).not.toContain("tests/risk-queue-page.test.tsx");

    expect(futureReference).toContain("tests/monthly-digest-route.test.ts");
    expect(futureReference).toContain("tests/support-economics.test.ts");
    expect(futureReference).toContain("tests/conversion-strategy.test.ts");
    expect(futureReference).toContain("tests/red-team-strategy.test.ts");
    expect(futureReference).toContain("tests/unified-blueprint.test.ts");

    expect(intelligenceReleaseGate).toContain("tests/intelligence-release-gate.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/financial-exposure.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/risk-score.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/procurement-query-helpers.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/intelligence-access.test.ts");
    expect(intelligenceReleaseGate).toContain("tests/financial-intelligence-page.test.tsx");
    expect(intelligenceReleaseGate).toContain("tests/procurement-analytics-page.test.tsx");
    expect(intelligenceReleaseGate).toContain("tests/risk-queue-page.test.tsx");
    expect(intelligenceReleaseGate).toContain("tests/risk-explanation-drawer.test.tsx");
  });
});
