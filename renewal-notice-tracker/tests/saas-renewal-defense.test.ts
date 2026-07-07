import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateNoticeDeadline,
  calculateSaasContractRiskFindings,
  daysUntilOptOut,
  getOptOutUrgency
} from "@/lib/saas/renewal-defense";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("SaaS Renewal Defense runtime slice", () => {
  it("calculates notice deadlines from explicit dates or notice periods", () => {
    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticeDeadlineDate: "2026-08-15",
        noticePeriodValue: 30,
        noticePeriodUnit: "days"
      })
    ).toBe("2026-08-15");

    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticePeriodValue: 30,
        noticePeriodUnit: "days"
      })
    ).toBe("2026-09-01");

    expect(
      calculateNoticeDeadline({
        expirationDate: "2026-12-15",
        noticePeriodValue: 8,
        noticePeriodUnit: "weeks"
      })
    ).toBe("2026-10-20");

    expect(
      calculateNoticeDeadline({
        renewalDate: "2026-10-01",
        noticePeriodValue: 2,
        noticePeriodUnit: "months"
      })
    ).toBe("2026-08-01");
  });

  it("scores opt-out urgency from the active date boundary", () => {
    expect(daysUntilOptOut("2026-07-06", "2026-07-07")).toBe(-1);
    expect(getOptOutUrgency("2026-07-06", "2026-07-07")).toBe("expired");
    expect(getOptOutUrgency("2026-07-21", "2026-07-07")).toBe("critical");
    expect(getOptOutUrgency("2026-08-01", "2026-07-07")).toBe("high");
    expect(getOptOutUrgency("2026-08-20", "2026-07-07")).toBe("medium");
    expect(getOptOutUrgency("2026-10-01", "2026-07-07")).toBe("low");
  });

  it("creates missing deadline and auto-renewal risk findings without outreach behavior", () => {
    expect(
      calculateSaasContractRiskFindings({
        autoRenewal: true,
        renewalDate: null,
        expirationDate: null,
        noticeDeadlineDate: null,
        noticePeriodValue: null,
        noticePeriodUnit: null,
        today: "2026-07-07"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ findingType: "auto_renewal", severity: "medium" }),
        expect.objectContaining({ findingType: "missing_notice_deadline", severity: "high" })
      ])
    );

    expect(
      calculateSaasContractRiskFindings({
        autoRenewal: true,
        noticeDeadlineDate: "2026-07-12",
        today: "2026-07-07"
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ findingType: "auto_renewal", severity: "critical" }),
        expect.objectContaining({ findingType: "critical_opt_out", severity: "critical" })
      ])
    );
  });

  it("keeps the new SaaS runtime module scoped and away from the admin service-role client", () => {
    for (const relativePath of [
      "lib/saas/queries.ts",
      "lib/saas/renewal-defense.ts",
      "lib/actions/saas-renewal-defense.ts",
      "app/dashboard/saas-opt-out-clock/page.tsx"
    ]) {
      const source = readProjectFile(relativePath);
      expect(source).not.toContain("@/lib/supabase/admin");
      expect(source).not.toMatch(/Revenue Intelligence|cold outreach|Slack|Teams war room|automatic notice sending/i);
    }

    const queries = readProjectFile("lib/saas/queries.ts");
    expect(queries).toContain('.eq("organization_id", organizationId)');
    expect(queries).toContain('.eq("id", softwareId)');

    const actions = readProjectFile("lib/actions/saas-renewal-defense.ts");
    expect(actions).toContain("requireOrganization()");
    expect(actions).toContain("requireScopedSaasSoftware(payload.softwareId, context.organizationId)");
    expect(actions).toContain("organization_id: context.organizationId");
  });

  it("adds RLS-aware organization-scoped SaaS tables", () => {
    const migration = readProjectFile("supabase/migrations/202607070001_saas_renewal_defense.sql");
    for (const table of [
      "saas_software_inventory",
      "saas_contract_terms",
      "saas_opt_out_windows",
      "saas_contract_risk_findings"
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`memberships.organization_id = ${table}.organization_id`);
    }
  });
});
