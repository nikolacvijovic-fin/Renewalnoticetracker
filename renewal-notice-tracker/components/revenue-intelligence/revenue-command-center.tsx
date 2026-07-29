import {
  enqueueRevenueIntelligenceRefreshJobFormAction,
  generateRevenueIntelligenceSnapshotFormAction
} from "@/lib/actions/revenue-intelligence";
import type { RevenueIntelligenceDashboard } from "@/lib/revenue-intelligence/revenue-types";
import { ServerActionForm } from "@/components/ui/server-action-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RevenueKpiStrip } from "@/components/revenue-intelligence/revenue-kpi-strip";
import { RevenueRiskQueue } from "@/components/revenue-intelligence/revenue-risk-queue";
import { CommercialImpactChart } from "@/components/revenue-intelligence/commercial-impact-chart";
import { VendorCategorySummaryTable } from "@/components/revenue-intelligence/vendor-category-summary-table";
import { ForecastScenarioPanel } from "@/components/revenue-intelligence/forecast-scenario-panel";
import { ExecutiveInsightsPanel } from "@/components/revenue-intelligence/executive-insights-panel";
import { BlockedDecisionsPanel } from "@/components/revenue-intelligence/blocked-decisions-panel";
import { SavingsPipelinePanel } from "@/components/revenue-intelligence/savings-pipeline-panel";
import { NegotiationPipelinePanel } from "@/components/revenue-intelligence/negotiation-pipeline-panel";
import { OutreachPipelinePanel } from "@/components/revenue-intelligence/outreach-pipeline-panel";

export function RevenueCommandCenter({
  dashboard,
  canAct
}: {
  dashboard: RevenueIntelligenceDashboard;
  canAct: boolean;
}) {
  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="automation">Revenue Intelligence</Badge>
              <Badge tone="locked">No external sending</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-ink">Revenue Intelligence Command Center</h1>
            <p className="mt-2 max-w-4xl text-sm text-muted">
              Leadership-grade renewal exposure, savings, decision, negotiation, and outreach evidence. Every number links back to existing contract and commercial workflow records.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Last refreshed: {dashboard.snapshot?.created_at ? new Date(dashboard.snapshot.created_at).toLocaleString() : "No snapshot generated yet"}
            </p>
          </div>
          {canAct ? (
            <div className="flex flex-wrap gap-2">
              <ServerActionForm serverAction={generateRevenueIntelligenceSnapshotFormAction}>
                <Button type="submit">Refresh now</Button>
              </ServerActionForm>
              <ServerActionForm serverAction={enqueueRevenueIntelligenceRefreshJobFormAction}>
                <Button type="submit" variant="secondary">Queue refresh</Button>
              </ServerActionForm>
            </div>
          ) : null}
        </div>
      </div>

      {!dashboard.snapshot ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <p className="text-sm font-semibold text-ink">No revenue intelligence snapshot yet.</p>
          <p className="mt-2 text-sm text-muted">Generate a snapshot after contracts, quote comparisons, savings opportunities, commercial decisions, negotiation briefs, or internal outreach evidence exists.</p>
        </div>
      ) : null}

      <RevenueKpiStrip dashboard={dashboard} />
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <RevenueRiskQueue items={dashboard.riskQueue} canAct={canAct} />
        <ExecutiveInsightsPanel insights={dashboard.insights} canAct={canAct} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <CommercialImpactChart metrics={dashboard.metrics} />
        <ForecastScenarioPanel forecasts={dashboard.forecasts} />
      </div>
      <VendorCategorySummaryTable rows={dashboard.vendorCategorySummaries} />
      <div className="grid gap-5 xl:grid-cols-3">
        <BlockedDecisionsPanel signals={dashboard.signals} />
        <SavingsPipelinePanel opportunities={dashboard.opportunities} />
        <NegotiationPipelinePanel opportunities={dashboard.opportunities} />
        <OutreachPipelinePanel opportunities={dashboard.opportunities} />
      </div>
    </section>
  );
}
