import type {
  ProcurementAnalyticsDashboard,
  ProcurementAnalyticsRow
} from "@/lib/intelligence/procurement/query-helpers";
import type { IntelligenceTrustLevel } from "@/lib/intelligence/shared/types";

export type ProcurementDashboardActionItem = {
  key: string;
  label: string;
  primaryValue: string;
  secondaryValue?: string | null;
  trustLevel: IntelligenceTrustLevel;
  trustLabel: string;
  warning?: ProcurementAnalyticsRow["warnings"][number] | null;
  href: string;
  actionLabel: string;
};

export type ProcurementAnalyticsPageModel = {
  summary: {
    decisionGapCount: number;
    duplicateCleanupCount: number;
  };
  topVendorRows: ProcurementDashboardActionItem[];
  dueSoonVendorRows: ProcurementDashboardActionItem[];
  ownerGapRows: ProcurementDashboardActionItem[];
  decisionGapRows: ProcurementDashboardActionItem[];
  autoRenewalRows: ProcurementDashboardActionItem[];
  duplicateRows: ProcurementDashboardActionItem[];
  outcomeRows: ProcurementDashboardActionItem[];
};

export type ProcurementAnalyticsViewedAuditPayload = {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowConfidenceContractCount: number;
  warningCount: number;
  calculationVersion: string;
};

export function buildProcurementAnalyticsViewedAuditPayload(input: {
  organizationId: string;
  actorUserId: string;
  dashboard: ProcurementAnalyticsDashboard;
}): ProcurementAnalyticsViewedAuditPayload {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractCount: input.dashboard.totalContractsInScope,
    lowConfidenceContractCount: input.dashboard.lowConfidenceContractCount,
    warningCount: input.dashboard.combinedWarnings.length,
    calculationVersion: "procurement_analytics.v1"
  };
}

export function buildProcurementAnalyticsPageModel(
  dashboard: ProcurementAnalyticsDashboard
): ProcurementAnalyticsPageModel {
  return {
    summary: {
      decisionGapCount:
        dashboard.decisionGapSummary.rows.find((row) => row.key === "decision_gap")
          ?.contract_count ?? 0,
      duplicateCleanupCount: dashboard.duplicateCounterpartySummary.rows.length
    },
    topVendorRows: mapRowsToActionItems(
      dashboard.vendorExposureSummary.rows.slice(0, 8),
      {
        procurementView: "top_vendors_exposure",
        primaryValue: (row) => formatExposure(row),
        secondaryValue: (row) =>
          `${row.contract_count} contract${row.contract_count === 1 ? "" : "s"}`,
        actionLabel: "Open vendor contracts"
      }
    ),
    dueSoonVendorRows: mapRowsToActionItems(
      dashboard.dueSoonVendorConcentration.rows.slice(0, 8),
      {
        procurementView: "vendor_due_soon",
        primaryValue: (row) => `${row.due_soon_contract_count} due soon`,
        secondaryValue: (row) => formatExposure(row),
        actionLabel: "Work due-soon contracts"
      }
    ),
    ownerGapRows: mapRowsToActionItems(
      dashboard.departmentExposureSummary.rows
        .filter((row) => row.owner_missing_contract_count > 0)
        .sort(
          (left, right) =>
            right.owner_missing_contract_count - left.owner_missing_contract_count
        )
        .slice(0, 8),
      {
        procurementView: "owner_gaps_by_department",
        primaryValue: (row) =>
          `${row.owner_missing_contract_count} owner gap${row.owner_missing_contract_count === 1 ? "" : "s"}`,
        secondaryValue: (row) => formatExposure(row),
        actionLabel: "Assign owners"
      }
    ),
    decisionGapRows: mapRowsToActionItems(
      dashboard.ownerCoverageSummary.rows
        .filter((row) => row.decision_gap_contract_count > 0)
        .sort(
          (left, right) =>
            right.decision_gap_contract_count - left.decision_gap_contract_count
        )
        .slice(0, 8),
      {
        procurementView: "decision_gaps_by_owner",
        primaryValue: (row) =>
          `${row.decision_gap_contract_count} decision gap${row.decision_gap_contract_count === 1 ? "" : "s"}`,
        secondaryValue: (row) => formatExposure(row),
        actionLabel: "Record decisions"
      }
    ),
    autoRenewalRows: mapRowsToActionItems(
      dashboard.autoRenewalConcentrationSummary.rows
        .filter((row) => row.decision_gap_contract_count > 0)
        .sort(
          (left, right) =>
            right.decision_gap_contract_count - left.decision_gap_contract_count
        )
        .slice(0, 8),
      {
        procurementView: "auto_renewals_needing_decision",
        primaryValue: (row) =>
          `${row.auto_renewal_contract_count} auto-renewal${row.auto_renewal_contract_count === 1 ? "" : "s"}`,
        secondaryValue: (row) =>
          `${row.decision_gap_contract_count} still need${row.decision_gap_contract_count === 1 ? "s" : ""} a decision`,
        actionLabel: "Review auto-renewals"
      }
    ),
    duplicateRows: mapRowsToActionItems(
      dashboard.duplicateCounterpartySummary.rows.slice(0, 8),
      {
        procurementView: "duplicate_counterparty_cleanup",
        primaryValue: (row) =>
          `${row.duplicate_suggestions?.length ?? 0} duplicate match${(row.duplicate_suggestions?.length ?? 0) === 1 ? "" : "es"}`,
        secondaryValue: (row) =>
          `${row.contract_count} contract${row.contract_count === 1 ? "" : "s"} need cleanup`,
        actionLabel: "Clean up vendor identity"
      }
    ),
    outcomeRows: mapRowsToActionItems(
      dashboard.renewalOutcomeHistory.rows.slice(0, 8),
      {
        procurementView: "renewal_outcome_history",
        primaryValue: (row) =>
          `${row.contract_count} outcome${row.contract_count === 1 ? "" : "s"}`,
        secondaryValue: (row) =>
          row.latest_decision_date
            ? `Latest decision: ${row.latest_decision_date}`
            : null,
        actionLabel: "Open decided contracts"
      }
    )
  };
}

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
): ProcurementDashboardActionItem[] {
  return rows
    .filter((row) => row.drilldown_contract_ids.length > 0)
    .map((row) => ({
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
