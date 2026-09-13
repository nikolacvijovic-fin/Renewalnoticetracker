import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const runner = path.join(root, "scripts", "run-supabase-migrations.mjs");

function executeMigrationCommand(args: string[], env: Record<string, string>) {
  return spawnSync(process.execPath, [runner, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
}

describe("migration rollout tooling", () => {
  it("fails before invoking the CLI when the reviewed plan fingerprint is absent or stale", () => {
    const result = executeMigrationCommand(["--verify-reviewed-plan"], {
      RELEASE_TARGET_ENV: "staging",
      SUPABASE_DB_URL: "postgresql://example.invalid/staging",
      MIGRATION_PLAN_REVIEW_SHA256: "stale-plan"
    });

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain("MIGRATION_PLAN_REVIEW_SHA256");
    expect(`${result.stdout}${result.stderr}`).not.toContain("postgresql://example.invalid/staging");
  });

  it("keeps rollout forward-only and requires an explicit target confirmation before apply", () => {
    const source = fs.readFileSync(runner, "utf8");

    expect(source).toContain('RELEASE_TARGET_ENV must be staging or production');
    expect(source).toContain("CONFIRM_DATABASE_MIGRATION_ROLLOUT");
    expect(source).toContain("MIGRATION_PLAN_REVIEW_SHA256");
    expect(source).toContain("--dry-run");
    expect(source).not.toMatch(/rollback|drop\s+(table|column)|delete\s+from/i);
  });
});
