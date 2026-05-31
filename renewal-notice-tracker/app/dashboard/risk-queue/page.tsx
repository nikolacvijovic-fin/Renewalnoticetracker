import Link from "next/link";
import {
  getContractFacets,
  getContracts,
  getCounterparties
} from "@/lib/contracts/kernel-queries";
import { RiskQueueFilters } from "@/components/dashboard/risk-queue-filters";
import { RiskQueueTable } from "@/components/dashboard/risk-queue-table";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import {
  buildRiskQueueContractQueryOptions,
  buildRiskQueuePageModel,
  buildRiskQueueViewedAuditPayload
} from "@/lib/intelligence/risk/page-model";
import {
  auditRiskQueueViewed
} from "@/lib/intelligence/audit";
import { requireIntelligencePageContext } from "@/lib/intelligence/page-access";

export default async function RiskQueuePage({
  searchParams
}: {
  searchParams: {
    owner?: string;
    department?: string;
    riskBand?: string;
    dueWindow?: string;
    trustStatus?: string;
  };
}) {
  const context = await requireIntelligencePageContext("risk_queue");

  const { organizationId } = context;
  const [contracts, facets, counterparties] = await Promise.all([
    getContracts(
      organizationId,
      "all",
      buildRiskQueueContractQueryOptions(searchParams)
    ),
    getContractFacets(organizationId),
    getCounterparties(organizationId)
  ]);

  const dashboard = buildRiskQueuePageModel({
    contracts,
    facets,
    counterparties,
    searchParams
  });
  await auditRiskQueueViewed(
    buildRiskQueueViewedAuditPayload({
      organizationId,
      actorUserId: context.user.id,
      dashboard
    })
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Risk Queue</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
            Work the contracts that need attention first. The score stays narrow: it only points back into review, owner assignment, acknowledgment, and decision work.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/dashboard/contracts">Open contracts</Link>
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contracts in queue" value={dashboard.summary.total} accent="bg-slate-400" />
        <MetricCard label="Critical risk" value={dashboard.summary.critical} accent="bg-rose-400" />
        <MetricCard label="High risk" value={dashboard.summary.high} accent="bg-orange-400" />
        <MetricCard label="Low confidence" value={dashboard.summary.lowConfidence} accent="bg-amber-400" />
      </section>

      <RiskQueueFilters options={dashboard.filterOptions} current={dashboard.filters} />

      {dashboard.emptyState ? (
        <div className="panel rounded-3xl border border-dashed border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900">{dashboard.emptyState.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{dashboard.emptyState.description}</p>
          <Button asChild className="mt-4">
            <Link href={dashboard.emptyState.actionHref}>{dashboard.emptyState.actionLabel}</Link>
          </Button>
        </div>
      ) : null}

      <RiskQueueTable rows={dashboard.rows} />
    </section>
  );
}
