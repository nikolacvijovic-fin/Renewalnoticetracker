import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS } from "@/lib/supabase/privileged-access-policy";

const projectRoot = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("revenue intelligence boundaries", () => {
  it("creates scoped revenue intelligence tables with RLS and bounded enum contracts", () => {
    const migration = read("supabase/migrations/202607300001_revenue_intelligence_command_center.sql");

    for (const table of [
      "revenue_intelligence_snapshots",
      "revenue_risk_signals",
      "commercial_impact_metrics",
      "vendor_category_intelligence_summaries",
      "revenue_forecast_scenarios",
      "executive_insights",
      "revenue_intelligence_evidence_links"
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }

    expect(migration).toContain("organization_id uuid not null references public.organizations(id) on delete cascade");
    expect(migration).toContain("idx_revenue_snapshots_org_period");
    expect(migration).toContain("on public.revenue_intelligence_snapshots(organization_id, period_start, period_end, created_at desc)");
    expect(migration).toContain("idx_revenue_signals_org_type");
    expect(migration).toContain("on public.commercial_impact_metrics(organization_id, metric_type, status)");
    expect(migration).toContain("on public.revenue_intelligence_evidence_links(organization_id, contract_id, status)");
    expect(migration).toContain("constraint revenue_risk_signals_type_check check (signal_type in");
    expect(migration).toContain("constraint commercial_impact_metrics_type_check check (metric_type in");
    expect(migration).toContain("constraint revenue_forecast_scenarios_scenario_check check (scenario in");
    expect(migration).toContain("status text not null default 'active'");
    expect(migration).not.toMatch(/raw_contract_text|ocr_output|provider_payload|storage_path|full_notes/);
  });

  it("loads source data through organization-scoped, bounded read queries without raw content fields", () => {
    const source = read("lib/revenue-intelligence/revenue-intelligence-source-queries.ts");

    for (const table of [
      "contracts",
      "renewal_quote_comparisons",
      "renewal_quote_findings",
      "savings_opportunities",
      "renewal_commercial_decisions",
      "renewal_negotiation_briefs",
      "internal_outreach_opportunities"
    ]) {
      expect(source).toContain(`.from("${table}")`);
    }

    expect(source.match(/\.eq\("organization_id", input\.organizationId\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(source).toContain("Math.min(Math.max(input.limit ?? 1000, 1), 5000)");
    expect(source).not.toMatch(/raw_contract_text|ocr_output|provider_payload|storage_path|full_notes|draft_body|email_body/);
  });

  it("keeps privileged writes behind the approved revenue intelligence repository boundary", () => {
    const repositoryPath = "lib/revenue-intelligence/repositories/admin-revenue-intelligence-repository.ts";
    const repository = read(repositoryPath);
    const service = read("lib/revenue-intelligence/revenue-intelligence.ts");
    const actions = read("lib/actions/revenue-intelligence.ts");

    expect(APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS).toContain(repositoryPath);
    expect(repository).toContain('import { createAdminSupabaseClient } from "@/lib/supabase/admin"');
    expect(repository).toContain(".eq(\"organization_id\", input.organizationId)");
    expect(service).not.toContain("@/lib/supabase/admin");
    expect(actions).not.toContain("@/lib/supabase/admin");
  });
});
