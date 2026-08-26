import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "202608250001_evidence_accuracy_commercial_enforcement.sql"), "utf8");

describe("evidence accuracy and commercial enforcement migration", () => {
  it("adds explicit provenance lifecycle and freshness fields", () => {
    for (const field of [
      "match_status", "resolved_at", "superseded_at", "owner_confirmed_at", "owner_confirmed_by_user_id",
      "department_confirmed_at", "financial_terms_reviewed_at", "deadline_verified_at", "deadline_timezone",
      "quote_reviewed_at", "profile_selected_at", "profile_selected_by_user_id", "approval_evidence_hash",
      "approval_evidence_verified_at", "material_evidence_hash", "recalculation_trigger"
    ]) expect(sql).toContain(field);
    expect(sql).toContain("persist_evidence_readiness_assessment_v2");
  });

  it("serializes paid-beta seat enforcement and documents pending invitations", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain("maximum_user_seats");
    expect(sql).toContain("Pending invitations do not consume seats");
    expect(sql).toContain("beta.user_seat_limit_overridden");
    expect(sql).toContain("organization_id = new.organization_id");
  });

  it("backs application checks with database-enforced paid-beta read-only guards", () => {
    expect(sql).toContain("enforce_design_partner_beta_org_writable");
    expect(sql).toContain("status <> 'active'");
    expect(sql).toContain("founder_approved_at is null");
    expect(sql).toContain("now() >= v_control.expires_at");
    expect(sql).toContain("now() >= v_control.grace_ends_at");
    expect(sql).toContain("auth.role() = 'service_role'");
    expect(sql).toContain("beta.mutation_overridden");
    for (const table of [
      "contracts",
      "memberships",
      "subscription_usage_provider_connections",
      "license_waste_opportunities",
      "renewal_commercial_decisions",
      "renewal_decision_scenarios",
      "renewal_workspace_tasks",
      "renewal_decision_outcomes",
      "renewal_negotiation_briefs",
      "vendor_communication_drafts",
      "evidence_readiness_assessments"
    ]) expect(sql).toContain(`'${table}'`);
  });

  it("constrains finding review statuses to the shared runtime state machine", () => {
    expect(sql).toContain("review_status in ('open', 'accepted', 'rejected', 'deferred', 'action_planned')");
  });

  it("binds approvals and outcomes to current material evidence", () => {
    expect(sql).toContain("bind_renewal_approval_to_material_evidence");
    expect(sql).toContain("invalidate_renewal_approval_after_material_evidence_change");
    expect(sql).toContain("require_current_material_evidence_for_renewal_outcome");
    expect(sql).toContain("old.material_evidence_hash is not distinct from new.material_evidence_hash");
    expect(sql).toContain("approval_evidence_hash is distinct from new.material_evidence_hash");
    expect(sql).toContain("Renewal outcome requires approval against current material evidence");
  });
});
