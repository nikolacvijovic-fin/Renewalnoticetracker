import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607210001_contract_intelligence_extraction_evidence.sql"),
  "utf8"
);

describe("contract extraction evidence migration", () => {
  it("creates durable run and extracted-field evidence tables", () => {
    expect(migration).toContain("create table if not exists public.contract_extraction_runs");
    expect(migration).toContain("create table if not exists public.contract_extracted_fields");
    expect(migration).toContain("references public.contracts(id)");
    expect(migration).toContain("references public.contract_files(id)");
  });

  it("locks statuses, modes, field keys, confidence, and snippet length", () => {
    expect(migration).toContain("status in ('queued', 'processing', 'completed', 'failed', 'cancelled')");
    expect(migration).toContain("extraction_mode in ('deterministic_scaffold', 'provider_backed')");
    expect(migration).toContain("confidence >= 0 and confidence <= 1");
    expect(migration).toContain("evidence_status in ('pending_review', 'accepted', 'rejected', 'superseded')");
    expect(migration).toContain("'notice_deadline_date'");
    expect(migration).toContain("'contract_value_currency'");
    expect(migration).toContain("char_length(source_snippet) <= 1000");
    expect(migration).toContain("unique (extraction_run_id, field_key)");
  });

  it("enables organization-scoped RLS without broad direct mutation policies for fields", () => {
    expect(migration).toContain("alter table public.contract_extraction_runs enable row level security");
    expect(migration).toContain("alter table public.contract_extracted_fields enable row level security");
    expect(migration).toContain("Org members can read contract extracted fields");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
  });
});
