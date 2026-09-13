import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(process.cwd(), "..");
const workflow = fs.readFileSync(path.join(workspaceRoot, ".github", "workflows", "release-readiness.yml"), "utf8");

describe("Wave 2 release workflow", () => {
  it("requires readiness, reviewed migration evidence, and the deterministic SaaS PDF staging proof", () => {
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("migration_plan_review_sha256");
    expect(workflow).toContain("MIGRATION_PLAN_REVIEW_SHA256");
    expect(workflow).toContain("E2E_CONTRACT_INTELLIGENCE_PDF_PATH");
    expect(workflow).toContain("Create deterministic SaaS PDF fixture");
    expect(workflow).toContain("RUNNER_TEMP");
    expect(workflow).toContain("GITHUB_ENV");
    expect(workflow).not.toContain("${{ runner.temp }}");
    expect(workflow).toContain("npm run runtime:health");
    expect(workflow).toContain("npm run db:migrations:plan");
    expect(workflow).toContain("npm run db:migrations:verify-reviewed");
    expect(workflow).toContain("npm run release:strict");
  });
});
