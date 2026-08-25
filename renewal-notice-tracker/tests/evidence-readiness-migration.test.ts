import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase", "migrations", "202608240003_evidence_completeness_score.sql"),
  "utf8"
);
const databaseTest = fs.readFileSync(
  path.join(process.cwd(), "supabase", "tests", "evidence_readiness_test.sql"),
  "utf8"
);

describe("evidence readiness migration", () => {
  it("creates current items and history as organization-scoped RLS tables", () => {
    for (const table of ["evidence_readiness_assessments", "evidence_readiness_items", "evidence_readiness_history"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("where m.organization_id = evidence_readiness_assessments.organization_id");
    expect(migration).toContain("where m.organization_id = evidence_readiness_items.organization_id");
    expect(migration).toContain("where m.organization_id = evidence_readiness_history.organization_id");
  });

  it("prevents authenticated clients from forging readiness writes", () => {
    expect(migration).toContain("revoke insert, update, delete on public.evidence_readiness_assessments from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.persist_evidence_readiness_assessment");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/grant execute on function public\.persist_evidence_readiness_assessment[\s\S]*to authenticated/);
  });

  it("enforces contract and assessment tenant coherence", () => {
    expect(migration).toContain("evidence readiness contract organization mismatch");
    expect(migration).toContain("evidence readiness assessment scope mismatch");
    expect(migration).toContain("contract not found in organization");
  });

  it("serializes concurrent recalculation and skips identical history", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_assessment.evidence_hash = p_evidence_hash");
    expect(migration).toContain("'changed', false");
    expect(migration).toContain("insert into public.evidence_readiness_history");
  });

  it("stores bounded provenance rather than raw evidence content", () => {
    expect(migration).toContain("source_record_id text");
    expect(migration).toContain("char_length(source_record_id) <= 160");
    expect(migration).toContain("char_length(explanation) between 1 and 300");
    expect(migration).toContain("v_item_snapshot");
    expect(migration).toContain("jsonb_build_object(");
    expect(migration).not.toContain("p_items, p_calculated_at");
    expect(migration).not.toMatch(/raw_contract_text|provider_payload|ocr_output|quote_contents|access_token/i);
  });

  it("ships database integration coverage for RLS, scope, history, and idempotency", () => {
    expect(databaseTest).toContain("authenticated sessions cannot persist readiness directly");
    expect(databaseTest).toContain("an identical recalculation creates no duplicate history");
    expect(databaseTest).toContain("service persistence rejects a cross-organization contract");
    expect(databaseTest).toContain("a member of another organization cannot read readiness assessments");
    expect(databaseTest).toContain("history rebuilds an allowlisted snapshot and drops arbitrary input fields");
  });
});
