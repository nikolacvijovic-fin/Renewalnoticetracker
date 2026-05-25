import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/auth";
import {
  getProcurementAnalyticsDashboard,
  normalizeProcurementDueWindow,
  normalizeProcurementTrustFilter,
  type ProcurementAnalyticsRow
} from "@/lib/intelligence/procurement/query-helpers";
import { ProcurementAnalyticsFilters } from "@/components/dashboard/procurement-analytics-filters";
import {
  ProcurementActionList,
  type ProcurementActionListItem
} from "@/components/dashboard/procurement-action-list";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Button } from "@/components/ui/button";
import { assertCanAccessIntelligenceSurface } from "@/lib/intelligence/access";
import { auditProcurementAnalyticsViewed } from "@/lib/intelligence/audit";

function buildContractsDrilldownHref(input: {
  contractIds: string[];
  procurementView: string;
}) {
  const params = new URLSearchParams({
    contractIds: input.contractIds.join(","),
    procurementView: input.procurementView
  });

  return `/dashboard/contracts?${params.toString()}`;
}

function trustLabelFromRow(row: ProcurementAnalyticsRow) {
  switch (row.trust_level) {
    case "high":
      return "High trust";
    case "medium":
      return "Medium trust";
    case "low":
      return "Low trust";
    case "blocked":
      return "Blocked";
    default:
      return "Unknown trust";
  }
}

function formatExposure(row: ProcurementAnalyticsRow) {
  if (row.exposure_amount == null || !row.exposure_currency) return "No trusted amount";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: row.exposure_currency,
    maximumFractionDigits: 0
  }).format(row.exposure_amount);
}

function mapRowsToActionItems(
  rows: ProcurementAnalyticsRow[],
  options: {
    procurementView: string;
    primaryValue: (row: ProcurementAnalyticsRow) => string;
    secondaryValue?: (row: ProcurementAnalyticsRow) => string | null;
    actionLabel: string;
  }
) {
  return rows
    .filter((row) => row.drilldown_contract_ids.length > 0)
    .map<ProcurementActionListItem>((row) => ({
      key: row.key,
      label: row.label,
      primaryValue: options.primaryValue(row),
      secondaryValue: options.secondaryValue?.(row) ?? null,
      trustLevel: row.trust_level,
      trustLabel: trustLabelFromRow(row),
      warning: row.warnings[0] ?? null,
      href: buildContractsDrilldownHref({
        contractIds: row.drilldown_contract_ids,
        procurementView: options.procurementView
      }),
      actionLabel: options.actionLabel
    }));
}

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
  const context = await requireOrganization();
  try {
    await assertCanAccessIntelligenceSurface({
      context,
      surface: "procurement_dashboard"
    });
  } catch {
    redirect("/dashboard");
  }

  const { organizationId } = context;
  const dashboard = await getProcurementAnalyticsDashboard(organizationId, {
    department: searchParams.department,
    ownerUserId: searchParams.owner,
    counterpartyName: searchParams.counterparty,
    dueWindowDays: normalizeProcurementDueWindow(searchParams.dueWindow),
    trustStatus: normalizeProcurementTrustFilter(searchParams.trustStatus)
  });
  await auditProcurementAnalyticsViewed({
    organizationId,
    actorUserId: context.user.id,
    contractCount: dashboard.totalContractsInScope,
    lowConfidenceContractCount: dashboard.lowConfidenceContractCount,
    warningCount: dashboard.combinedWarnings.length,
    calculationVersion: "procurement_analytics.v1"
  });

  const topVendorRows = mapRowsToActionItems(
    dashboard.vendorExposureSummary.rows.slice(0, 8),
    {
      procurementView: "top_vendors_exposure",
      primaryValue: (row) => formatExposure(row),
      secondaryValue: (row) =>
        `${row.contract_count} contract${row.contract_count === 1 ? "" : "s"}`,
      actionLabel: "Open vendor contracts"
    }
  );

  const dueSoonVendorRows = mapRowsToActionItems(
    dashboard.dueSoonVendorConcentration.rows.slice(0, 8),
    {
      procurementView: "vendor_due_soon",
      primaryValue: (row) => `${row.due_soon_contract_count} due soon`,
      secondaryValue: (row) => formatExposure(row),
      actionLabel: "Work due-soon contracts"
    }
  );

  const ownerGapRows = mapRowsToActionItems(
    dashboard.departmentExposureSummary.rows
      .filter((row) => row.owner_missing_contract_count > 0)
      .sort((left, right) => right.owner_missing_contract_count - left.owner_missing_contract_count)
      .slice(0, 8),
    {
      procurementView: "owner_gaps_by_department",
      primaryValue: (row) =>
        `${row.owner_missing_contract_count} owner gap${row.owner_missing_contract_count === 1 ? "" : "s"}`,
      secondaryValue: (row) => formatExposure(row),
      actionLabel: "Assign owners"
    }
  );

  const decisionGapRows = mapRowsToActionItems(
    dashboard.ownerCoverageSummary.rows
      .filter((row) => row.decision_gap_contract_count > 0)
      .sort((left, right) => right.decision_gap_contract_count - left.decision_gap_contract_count)
      .slice(0, 8),
    {
      procurementView: "decision_gaps_by_owner",
      primaryValue: (row) =>
        `${row.decision_gap_contract_count} decision gap${row.decision_gap_contract_count === 1 ? "" : "s"}`,
      secondaryValue: (row) => formatExposure(row),
      actionLabel: "Record decisions"
    }
  );

  const autoRenewalRows = mapRowsToActionItems(
    dashboard.autoRenewalConcentrationSummary.rows
      .filter((row) => row.decision_gap_contract_count > 0)
      .sort((left, right) => right.decision_gap_contract_count - left.decision_gap_contract_count)
      .slice(0, 8),
    {
      procurementView: "auto_renewals_needing_decision",
      primaryValue: (row) => `${row.auto_renewal_contract_count} auto-renewal`,
      secondaryValue: (row) =>
        `${row.decision_gap_contract_count} still need${row.decision_gap_contract_count === 1 ? "s" : ""} a decision`,
      actionLabel: "Review auto-renewals"
    }
  );

  const duplicateRows = mapRowsToActionItems(
    dashboard.duplicateCounterpartySummary.rows.slice(0, 8),
    {
      procurementView: "duplicate_counterparty_cleanup",
      primaryValue: (row) =>
        `${row.duplicate_suggestions?.length ?? 0} duplicate match${(row.duplicate_suggestions?.length ?? 0) === 1 ? "" : "es"}`,
      secondaryValue: (row) =>
        `${row.contract_count} contract${row.contract_count === 1 ? "" : "s"} need cleanup`,
      actionLabel: "Clean up vendor identity"
    }
  );

  const outcomeRows = mapRowsToActionItems(
    dashboard.renewalOutcomeHistory.rows.slice(0, 8),
    {
      procurementView: "renewal_outcome_history",
      primaryValue: (row) => `${row.contract_count} outcome${row.contract_count === 1 ? "" : "s"}`,
      secondaryValue: (row) => row.latest_decision_date ? `Latest decision: ${row.latest_decision_date}` : null,
      actionLabel: "Open decided contracts"
    }
  );

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Procurement Analytics</h1>
          <p className="mt-2 max-w-3xl text-slate-500">
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
          accent="bg-brand-400"
        />
        <MetricCard
          label="Low-confidence contracts"
          value={dashboard.lowConfidenceContractCount}
          accent="bg-amber-400"
        />
        <MetricCard
          label="Decision gaps"
          value={dashboard.decisionGapSummary.rows.find((row) => row.key === "decision_gap")?.contract_count ?? 0}
          accent="bg-rose-400"
        />
        <MetricCard
          label="Duplicate cleanup"
          value={dashboard.duplicateCounterpartySummary.rows.length}
          accent="bg-sky-400"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Top vendors by upcoming renewal exposure"
          description="Start where the most reviewed renewal value is concentrated."
          items={topVendorRows}
          emptyState="Add reviewed contract values and renewal-control dates to surface vendor exposure."
        />
        <ProcurementActionList
          title="Vendor contracts due soon"
          description="Focus the weekly queue on vendors with live obligations already approaching."
          items={dueSoonVendorRows}
          emptyState="No vendor obligations are currently due soon inside the active filters."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Owner gaps by department"
          description="Departments with owner gaps are the first place portfolio accountability breaks."
          items={ownerGapRows}
          emptyState="No owner gaps remain in the current scope."
        />
        <ProcurementActionList
          title="Decision gaps by owner"
          description="Owners with missing decisions are where renewal work is stalling."
          items={decisionGapRows}
          emptyState="No decision gaps remain in the current scope."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProcurementActionList
          title="Auto-renewals needing decision"
          description="Confirmed auto-renewals still missing a decision should be worked before the portfolio drifts."
          items={autoRenewalRows}
          emptyState="No auto-renewals currently need a decision in this scope."
        />
        <ProcurementActionList
          title="Duplicate counterparty cleanup"
          description="Vendor identity cleanup keeps the portfolio rollups trustworthy."
          items={duplicateRows}
          emptyState="No duplicate vendor cleanup items remain in this scope."
        />
      </div>

      <ProcurementActionList
        title="Renewal outcome history"
        description="Review the recent renewal outcomes behind the current portfolio scope."
        items={outcomeRows}
        emptyState="Outcome history appears after decisions are recorded."
      />
    </section>
  );
}
