import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608260002_contract_quote_negotiation_intelligence.sql"),
  "utf8"
);
const atomicMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608270001_atomic_commercial_comparison_persistence.sql"),
  "utf8"
);

describe("contract-to-quote migration", () => {
  it("creates immutable, versioned, organization-scoped commercial evidence", () => {
    expect(migration).toContain("create table if not exists public.contract_commercial_baselines");
    expect(migration).toContain("unique (organization_id, contract_id, version)");
    expect(migration).toContain("commercial baselines are immutable; create a new version");
    expect(migration).toContain("baseline evidence must be accepted and organization scoped");
    expect(migration).toContain("m.role in ('admin','operator','reviewer')");
  });

  it("keeps proposal evidence, cost bridges, scenarios, and estimates distinct", () => {
    expect(migration).toContain("renewal_quote_proposal_versions");
    expect(migration).toContain("renewal_quote_cost_bridges");
    expect(migration).toContain("renewal_quote_scenarios");
    expect(migration).toContain("reapproval_required");
    expect(migration).toContain("estimate_status in ('estimated', 'approved', 'realized')");
  });

  it("does not add vendor delivery or automatic communications", () => {
    expect(migration).not.toMatch(/send_email|recipient_email|provider_payload|message_body/i);
  });

  it("adds forward-only atomic and idempotent persistence", () => {
    expect(atomicMigration).toContain("persist_commercial_comparison_transaction");
    expect(atomicMigration).toContain("pg_advisory_xact_lock");
    expect(atomicMigration).toContain("idempotency_key");
  });
});
