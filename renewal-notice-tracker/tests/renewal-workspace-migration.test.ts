import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "202608240002_renewal_decision_negotiation_workspace.sql"),
  "utf8"
);

describe("renewal decision workspace migration", () => {
  it("adds organization-scoped scenario, task, and confirmed outcome records", () => {
    for (const table of ["renewal_decision_scenarios", "renewal_workspace_tasks", "renewal_decision_outcomes"]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration.toLowerCase()).not.toContain(" for delete");
    expect(migration).toContain("Renewal workspace scope mismatch");
    expect(migration).toContain("Renewal task owner must belong to the organization");
    expect(migration).toContain("Renewal task dependency must be completed first");
    expect(migration).toContain("Renewal decision owner must belong to the organization");
  });

  it("preserves versioned approvals and forces material changes through reapproval", () => {
    expect(migration).toContain("decision_version integer not null default 1");
    expect(migration).toContain("approved_version integer");
    expect(migration).toContain("new.decision_version := old.decision_version + 1");
    expect(migration).toContain("new.decision_status := 'returned_for_changes'");
    expect(migration).toContain("Confirmed renewal outcome decision is immutable");
    expect(migration).toContain("Approval version mismatch");
    expect(migration).toContain("Separation of approval duties required");
  });

  it("uses atomic scoped RPCs for preferred scenarios and outcomes", () => {
    expect(migration).toContain("select_renewal_decision_scenario");
    expect(migration).toContain("record_renewal_decision_outcome");
    expect(migration).toContain("approve_renewal_decision_version");
    expect(migration.match(/for update/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("Renewal outcome already confirmed");
    expect(migration).toContain("Approval step changed concurrently");
    expect(migration).toContain("approved_version is null or v_decision.approved_version <> v_decision.decision_version");
    expect(migration).toContain("unique (organization_id, decision_id)");
  });

  it("keeps estimated and realized savings distinct and vendor drafts permanently unsent", () => {
    expect(migration).toContain("estimated_savings numeric");
    expect(migration).toContain("realized_savings numeric");
    expect(migration).toContain("human_review_required = true and unsent = true");
    expect(migration).toContain("NoticeControl does not deliver vendor communication drafts");
  });

  it("restricts mutating RLS policies to renewal reviewers or the scoped task owner", () => {
    expect(migration).toContain("m.role in ('owner', 'admin', 'operator', 'reviewer')");
    expect(migration).toContain("owner_user_id = auth.uid()");
    expect(migration).toContain("public.is_renewal_workspace_reviewer(organization_id)");
  });
});
