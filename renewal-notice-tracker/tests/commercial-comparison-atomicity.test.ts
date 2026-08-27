import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/202608270001_atomic_commercial_comparison_persistence.sql"),
  "utf8"
);
const service = readFileSync(
  resolve(process.cwd(), "lib/quote-comparison/persisted-commercial-comparison.ts"),
  "utf8"
);

describe("atomic commercial comparison persistence", () => {
  it("uses one service-role-only transactional RPC with scoped locking and idempotency", () => {
    expect(migration).toContain("create or replace function public.persist_commercial_comparison_transaction");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("renewal_quote_comparisons_idempotency_idx");
    expect(migration).toContain("commercial comparison contract organization mismatch");
    expect(migration).toContain("commercial comparison baseline organization mismatch");
    expect(migration).toContain("commercial comparison proposal file organization mismatch");
    expect(migration).toContain("revoke all on function public.persist_commercial_comparison_transaction");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("does not describe independent application writes as a transaction", () => {
    expect(service).toContain("persistAdminCommercialComparisonTransaction");
    expect(service).not.toContain("insertAdminProposalVersion");
    expect(service).not.toContain("insertAdminProposalLineItems");
    expect(service).not.toContain("insertAdminCommercialCostBridge");
    expect(service).not.toContain("insertAdminRenewalQuoteFindings");
    expect(service).not.toContain("insertAdminSavingsOpportunity");
    expect(service).not.toContain("insertAdminCommercialScenarios");
  });

  it("stores one-time and recurring bridge values separately", () => {
    for (const column of [
      "current_one_time_cost",
      "proposed_one_time_cost",
      "current_commitment_cost",
      "proposed_commitment_cost",
      "recurring_delta",
      "one_time_delta",
      "residual_recurring_amount",
      "residual_one_time_amount"
    ]) {
      expect(migration).toContain(column);
    }
  });
});
