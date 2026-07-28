import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202607290001_commercial_decision_workbench.sql"),
  "utf8"
);

describe("commercial decision workbench migration", () => {
  it("creates the decision, evidence, approval, and snapshot tables", () => {
    expect(migration).toContain("create table if not exists public.renewal_commercial_decisions");
    expect(migration).toContain("create table if not exists public.renewal_decision_evidence_links");
    expect(migration).toContain("create table if not exists public.renewal_decision_approval_steps");
    expect(migration).toContain("create table if not exists public.renewal_decision_snapshots");
  });

  it("stores product-truth fields and stable enum checks", () => {
    for (const field of [
      "recommended_action",
      "decision_status",
      "negotiation_posture",
      "commercial_risk_level",
      "evidence_confidence",
      "estimated_savings_amount",
      "renewal_deadline",
      "notice_deadline",
      "blocker_codes",
      "warning_codes"
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("'renegotiate'");
    expect(migration).toContain("'finalized'");
    expect(migration).toContain("'challenge_increase'");
    expect(migration).toContain("'critical'");
  });

  it("indexes organization, contract, status, risk, dates, and decision owner", () => {
    expect(migration).toContain("idx_renewal_commercial_decisions_org_status");
    expect(migration).toContain("idx_renewal_commercial_decisions_org_contract");
    expect(migration).toContain("idx_renewal_commercial_decisions_org_risk");
    expect(migration).toContain("idx_renewal_commercial_decisions_due_dates");
    expect(migration).toContain("idx_renewal_commercial_decisions_owner");
  });

  it("enables RLS and limits mutations to review roles without broad deletes", () => {
    expect(migration).toContain("alter table public.renewal_commercial_decisions enable row level security");
    expect(migration).toContain("alter table public.renewal_decision_evidence_links enable row level security");
    expect(migration).toContain("m.role in ('admin', 'operator', 'reviewer')");
    expect(migration.toLowerCase()).not.toContain(" for delete");
  });
});
