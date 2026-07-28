import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = fs.readFileSync(
  path.join(process.cwd(), "supabase/migrations/202607200001_background_job_reliability.sql"),
  "utf8"
);

describe("background job reliability migration", () => {
  it("creates the job and attempt ledgers with constrained statuses and job types", () => {
    expect(migration).toContain("create table if not exists public.background_jobs");
    expect(migration).toContain("create table if not exists public.background_job_attempts");
    expect(migration).toContain("trusted_reminder_delivery");
    expect(migration).toContain("contract_import_processing");
    expect(migration).toContain("dead_lettered");
    expect(migration).toContain("retry_scheduled");
  });

  it("enforces organization-scoped idempotency and queue health indexes", () => {
    expect(migration).toContain("constraint background_jobs_org_idempotency_unique unique (organization_id, idempotency_key)");
    expect(migration).toContain("idx_background_jobs_org_status_scheduled");
    expect(migration).toContain("idx_background_jobs_processing_locked_at");
    expect(migration).toContain("idx_background_jobs_dead_lettered_at");
  });

  it("enables RLS and grants members read-only access without mutation policies", () => {
    expect(migration).toContain("alter table public.background_jobs enable row level security");
    expect(migration).toContain("create policy \"members can read background jobs\"");
    expect(migration).not.toMatch(/for insert/i);
    expect(migration).not.toMatch(/for update/i);
    expect(migration).not.toMatch(/for delete/i);
  });
});
