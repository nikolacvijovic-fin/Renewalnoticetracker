import Link from "next/link";
import {
  getProcurementAnalyticsDashboard
} from "@/lib/intelligence/procurement/query-helpers";
import { ProcurementAnalyticsFilters } from "@/components/dashboard/procurement-analytics-filters";
import { ProcurementActionList } from "@/components/dashboard/procurement-action-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import { auditProcurementAnalyticsViewed } from "@/lib/intelligence/audit";
import {
  buildProcurementAnalyticsDashboardQuery,
  buildProcurementAnalyticsPageModel,
  buildProcurementAnalyticsViewedAuditPayload
} from "@/lib/intelligence/procurement/page-model";
import { requireIntelligencePageContext } from "@/lib/intelligence/page-access";

export default async function ProcurementAnalyticsPage({
  searchParams
}: {
  searchParams: {
    department?: string;
    owner?: string;
    counterparty?: string;
    dueWindow?: string;
    trustStatus?: string;
  };
}) {
  const context = await requireIntelligencePageContext("procurement_dashboard");

  const { organizationId } = context;
  const dashboard = await getProcurementAnalyticsDashboard(
    organizationId,
    buildProcurementAnalyticsDashboardQuery(searchParams)
  );
  await auditProcurementAnalyticsViewed(
    buildProcurementAnalyticsViewedAuditPayload({
      organizationId,
      actorUserId: context.user.id,
      dashboard
    })
  );
  const pageModel = buildProcurementAnalyticsPageModel(dashboard);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Procurement Analytics</h1>
          <p className="mt-2 max-w-3xl text-muted">
            Run the renewal portfolio from reviewed workflow truth: see which vendors, owners, and departments need action before renewal dates slip.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts">Open contracts</Link>
        </Button>
      </div>

      <ProcurementAnalyticsFilters
        options={dashboard.filterOptions}
        current={dashboard.filters}
      />

      {dashboard.emptyState ? (
        <div className="panel rounded-3xl border border-dashed border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900">{dashboard.emptyState.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{dashboard.emptyState.description}</p>
          <Button asChild className="mt-4">
            <Link href={dashboard.emptyState.actionHref}>{dashboard.emptyState.actionLabel}</Link>
          </Button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Contracts in scope"
          value={dashboard.totalContractsInScope}
          accent="bg-brand-600"
        />
        <MetricCard
          label="Low-confidence contracts"
          value={dashboard.lowConfidenceContractCount}
          accent="bg-warning"
        />
        <MetricCard
          label="Decision gaps"
          value={pageModel.summary.decisionGapCount}
          accent="bg-urgent"
        />
        <MetricCard
          label="Duplicate cleanup"
          value={pageModel.summary.duplicateCleanupCount}
          accent="bg-automation"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Top vendors by upcoming renewal exposure"
          description="Start where the most reviewed renewal value is concentrated."
          items={pageModel.topVendorRows}
          emptyState="Add reviewed contract values and renewal-control dates to surface vendor exposure."
        />
        <ProcurementActionList
          title="Vendor contracts due soon"
          description="Focus the weekly queue on vendors with live obligations already approaching."
          items={pageModel.dueSoonVendorRows}
          emptyState="No vendor obligations are currently due soon inside the active filters."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Owner gaps by department"
          description="Departments with owner gaps are the first place portfolio accountability breaks."
          items={pageModel.ownerGapRows}
          emptyState="No owner gaps remain in the current scope."
        />
        <ProcurementActionList
          title="Decision gaps by owner"
          description="Owners with missing decisions are where renewal work is stalling."
          items={pageModel.decisionGapRows}
          emptyState="No decision gaps remain in the current scope."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Auto-renewals needing decision"
          description="Confirmed auto-renewals still missing a decision should be worked before the portfolio drifts."
          items={pageModel.autoRenewalRows}
          emptyState="No auto-renewals currently need a decision in this scope."
        />
        <ProcurementActionList
          title="Duplicate counterparty cleanup"
          description="Vendor identity cleanup keeps the portfolio rollups trustworthy."
          items={pageModel.duplicateRows}
          emptyState="No duplicate vendor cleanup items remain in this scope."
        />
      </div>

      <ProcurementActionList
        title="Renewal outcome history"
        description="Review the recent renewal outcomes behind the current portfolio scope."
        items={pageModel.outcomeRows}
        emptyState="Outcome history appears after decisions are recorded."
      />
    </section>
  );
}
