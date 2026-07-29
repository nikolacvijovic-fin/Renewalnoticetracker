import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607290003_internal_outreach_intelligence.sql"),
  "utf8"
);

describe("internal outreach intelligence migration", () => {
  it("creates the scoped runtime tables with RLS enabled", () => {
    for (const table of [
      "internal_outreach_opportunities",
      "internal_outreach_evidence_links",
      "internal_outreach_drafts",
      "internal_outreach_approval_steps",
      "internal_outreach_playbook_items",
      "internal_outreach_suppressions"
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
    }
  });

  it("keeps drafts approval/copy-only and does not define a send status", () => {
    expect(migration).toContain("internal_outreach_drafts_no_send_status_check");
    expect(migration).toContain("position('send' in lower(status)) = 0");
    expect(migration).toContain("copy_allowed boolean not null default false");
    expect(migration).not.toMatch(/\bfor\s+delete\b/i);
    expect(migration).not.toMatch(/\bfor\s+all\b/i);
  });

  it("stores suppressions by safe scoped targets or hashed contact identifiers", () => {
    expect(migration).toContain("contact_identifier_hash text null");
    expect(migration).toContain("scoped_internal_user_id uuid null");
    expect(migration).toContain("internal_outreach_suppressions_target_check");
    expect(migration).not.toContain("contact_email");
  });
});
