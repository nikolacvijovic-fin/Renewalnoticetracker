import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "202607190001_enterprise_trust_authority.sql"
);

describe("enterprise trust authority migration", () => {
  it("removes direct browser insert/update policies for trust approvals", () => {
    const source = fs.readFileSync(migrationPath, "utf8");

    expect(source).toContain('drop policy if exists "review-capable members can create contract trust exception approvals"');
    expect(source).toContain('drop policy if exists "review-capable members can revoke contract trust exception approvals"');
    expect(source).toContain("auth.role() <> 'service_role'");
    expect(source).toContain("must be created by trusted server authority");
  });

  it("enforces one non-revoked approval per org contract and type", () => {
    const source = fs.readFileSync(migrationPath, "utf8");

    expect(source).toContain("idx_contract_trust_exception_approvals_single_non_revoked");
    expect(source).toContain("organization_id, contract_id, approval_type");
    expect(source).toContain("where revoked_at is null");
  });

  it("documents server-computed confidence authority", () => {
    const source = fs.readFileSync(migrationPath, "utf8");

    expect(source).toContain("Service-role path computes evidence_confidence_at_approval");
    expect(source).toContain("Browser/client-supplied");
  });
});
