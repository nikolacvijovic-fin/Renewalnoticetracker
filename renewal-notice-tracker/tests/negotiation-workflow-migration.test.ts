import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607290002_negotiation_workflow.sql"),
  "utf8"
);

describe("negotiation workflow migration", () => {
  it("creates negotiation brief, evidence, draft, approval, and playbook tables", () => {
    expect(migration).toContain("create table if not exists public.renewal_negotiation_briefs");
    expect(migration).toContain("create table if not exists public.renewal_negotiation_brief_evidence_links");
    expect(migration).toContain("create table if not exists public.vendor_communication_drafts");
    expect(migration).toContain("create table if not exists public.vendor_communication_approval_steps");
    expect(migration).toContain("create table if not exists public.negotiation_playbook_items");
    expect(migration).toContain("organization_id uuid not null references public.organizations(id)");
    expect(migration).toContain("commercial_decision_id uuid not null references public.renewal_commercial_decisions(id)");
  });

  it("locks statuses, strategies, channels, approvals, and confidence bounds", () => {
    expect(migration).toContain("status in ('draft', 'evidence_pending', 'ready_for_review', 'in_approval', 'approved', 'rejected', 'archived')");
    expect(migration).toContain("'challenge_price_increase'");
    expect(migration).toContain("'cancel_or_nonrenew'");
    expect(migration).toContain("channel in ('email', 'internal_note', 'call_script')");
    expect(migration).toContain("tone in ('neutral', 'firm', 'collaborative', 'executive')");
    expect(migration).toContain("status in ('pending', 'approved', 'rejected', 'cancelled', 'skipped')");
    expect(migration).toContain("confidence >= 0 and confidence <= 1");
    expect(migration).toContain("renewal_negotiation_briefs_text_bounds_check");
    expect(migration).toContain("vendor_communication_drafts_text_bounds_check");
    expect(migration).toContain("char_length(draft_body) <= 4000");
  });

  it("uses organization-scoped RLS without delete-capable mutation policies", () => {
    expect(migration).toContain("alter table public.renewal_negotiation_briefs enable row level security");
    expect(migration).toContain("Org members can read negotiation briefs");
    expect(migration).toContain("Review roles can create negotiation briefs");
    expect(migration).toContain("Review roles can update negotiation briefs");
    expect(migration).toContain("m.role in ('admin', 'operator', 'reviewer')");
    expect(migration).not.toContain(" for all");
    expect(migration).not.toContain(" for delete");
  });

  it("indexes active workflow lookups and blocks multiple active briefs per decision", () => {
    expect(migration).toContain("idx_renewal_negotiation_briefs_one_active_per_decision");
    expect(migration).toContain("where status <> 'archived'");
    expect(migration).toContain("idx_vendor_communication_drafts_decision");
    expect(migration).toContain("idx_vendor_communication_approval_steps_draft");
  });
});
