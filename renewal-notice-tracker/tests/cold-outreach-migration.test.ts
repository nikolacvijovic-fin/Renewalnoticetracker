import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607300002_cold_outreach_draft_workbench.sql"),
  "utf8"
);

describe("cold outreach draft workbench migration", () => {
  it("creates org-scoped cold outreach MVP tables with RLS enabled", () => {
    for (const table of [
      "cold_outreach_leads",
      "cold_outreach_offers",
      "cold_outreach_drafts",
      "cold_outreach_approvals"
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
    }
  });

  it("stores the MVP lead/company and offer/ICP fields without contact emails", () => {
    for (const field of [
      "company_name text not null",
      "website text null",
      "website_hash text null",
      "industry text null",
      "company_size_band text not null",
      "role_title text null",
      "source_label text null",
      "source_url text null",
      "pain_signal text null",
      "evidence_confidence numeric not null",
      "suppression_status text not null",
      "offer_name text not null",
      "target_customer text not null",
      "primary_pain text not null",
      "value_prop text not null",
      "proof_points text[] not null",
      "disallowed_claims text[] not null"
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).not.toMatch(/\bcontact_email\b/i);
    expect(migration).not.toMatch(/\bemail_address\b/i);
  });

  it("requires evidence sources, keeps copy gated, and blocks delivery-shaped statuses", () => {
    expect(migration).toContain("cold_outreach_leads_source_required_check");
    expect(migration).toContain("cold_outreach_drafts_no_delivery_state_check");
    expect(migration).toContain("copy_allowed boolean not null default false");
    expect(migration).toContain("approval_state in ('draft', 'needs_review', 'approved_for_copy', 'rejected', 'archived')");
    expect(migration).toContain("selected_variant_type is null or selected_variant_type in ('concise_email', 'founder_led_email', 'linkedin_note', 'internal_reviewer_summary')");
    expect(migration).not.toMatch(/\b(sent|delivered|sequenced|scheduled)\b/i);
  });

  it("limits access to review roles rather than all organization members", () => {
    expect(migration).toContain("m.role in ('admin', 'operator', 'reviewer')");
    expect(migration).not.toContain("Org members can read cold outreach");
    expect(migration).not.toMatch(/\bfor\s+delete\b/i);
    expect(migration).not.toMatch(/\bfor\s+all\b/i);
  });
});
