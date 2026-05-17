import { addDays, parseISO, startOfDay } from "date-fns";
import {
  getContracts,
  getCounterparties,
  getRenewalDecisionAnalyticsRows,
  type CounterpartyRecord,
  type RenewalDecisionAnalyticsRecord
} from "@/lib/contracts/kernel-queries";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";
import {
  calculateAutoRenewalExposure,
  calculateRenewalExposure
} from "@/lib/intelligence/financial/exposure";
import type { FinancialExposureContractInput } from "@/lib/intelligence/financial/model";
import { buildTrustedWorkflowBasis } from "@/lib/intelligence/shared/trust";
import type {
  IntelligenceCalculationBasis,
  IntelligenceTrustLevel,
  IntelligenceWarning
} from "@/lib/intelligence/shared/types";

export const PROCUREMENT_DUE_WINDOWS = [30, 60, 90, 180] as const;
export const PROCUREMENT_TRUST_FILTERS = ["all", "verified", "low_confidence"] as const;

export type ProcurementDueWindowDays = (typeof PROCUREMENT_DUE_WINDOWS)[number];
export type ProcurementTrustFilter = (typeof PROCUREMENT_TRUST_FILTERS)[number];

export type ProcurementAnalyticsFilters = {
  department?: string | null;
  ownerUserId?: string | null;
  counterpartyName?: string | null;
  dueWindowDays?: ProcurementDueWindowDays | null;
  trustStatus?: ProcurementTrustFilter | null;
};

export type ProcurementAnalyticsRow = {
  key: string;
  label: string;
  contract_count: number;
  low_confidence_contract_count: number;
  owner_missing_contract_count: number;
  decision_gap_contract_count: number;
  due_soon_contract_count: number;
  auto_renewal_contract_count: number;
  drilldown_contract_ids: string[];
  trust_level: IntelligenceTrustLevel;
  warnings: IntelligenceWarning[];
  exposure_amount: number | null;
  exposure_currency: string | null;
  latest_decision_date?: string | null;
  duplicate_suggestions?: Array<{ id: string; raw_counterparty_name: string; score: number }>;
};

export type ProcurementAnalyticsSummary = {
  slug: string;
  title: string;
  rows: ProcurementAnalyticsRow[];
  total_contract_count: number;
  low_confidence_contract_count: number;
  warnings: IntelligenceWarning[];
  calculation_basis: IntelligenceCalculationBasis;
};

export type ProcurementAnalyticsFilterOptions = {
  departments: string[];
  owners: Array<{ user_id: string; label: string }>;
  counterparties: string[];
  dueWindows: readonly ProcurementDueWindowDays[];
  trustStatuses: readonly ProcurementTrustFilter[];
};

export type ProcurementAnalyticsEmptyState = {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

export type ProcurementAnalyticsDashboard = {
  filters: Required<{
    department: string;
    ownerUserId: string;
    counterpartyName: string;
    dueWindowDays: string;
    trustStatus: ProcurementTrustFilter;
  }>;
  filterOptions: ProcurementAnalyticsFilterOptions;
  emptyState: ProcurementAnalyticsEmptyState | null;
  totalContractsInScope: number;
  lowConfidenceContractCount: number;
  reviewedContractCount: number;
  ownerAssignedContractCount: number;
  valuedContractCount: number;
  vendorExposureSummary: ProcurementAnalyticsSummary;
  departmentExposureSummary: ProcurementAnalyticsSummary;
  ownerCoverageSummary: ProcurementAnalyticsSummary;
  decisionGapSummary: ProcurementAnalyticsSummary;
  dueSoonVendorConcentration: ProcurementAnalyticsSummary;
  duplicateCounterpartySummary: ProcurementAnalyticsSummary;
  renewalOutcomeHistory: ProcurementAnalyticsSummary;
  autoRenewalConcentrationSummary: ProcurementAnalyticsSummary;
  combinedWarnings: IntelligenceWarning[];
};

type ContractLookup = DashboardContractRow & { id: string };

type ProcurementAnalyticsContext = {
  contracts: ContractLookup[];
  counterparties: CounterpartyRecord[];
  counterpartyMap: Map<string, CounterpartyRecord>;
  decisions: RenewalDecisionAnalyticsRecord[];
};

export function normalizeProcurementDueWindow(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return PROCUREMENT_DUE_WINDOWS.includes(parsed as ProcurementDueWindowDays)
    ? (parsed as ProcurementDueWindowDays)
    : null;
}

export function normalizeProcurementTrustFilter(value: string | null | undefined) {
  return PROCUREMENT_TRUST_FILTERS.includes(value as ProcurementTrustFilter)
    ? (value as ProcurementTrustFilter)
    : "all";
}

function createWarning(
  code: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning"
): IntelligenceWarning {
  return { code, message, severity };
}

function toContractLookupRows(contracts: DashboardContractRow[]) {
  return contracts.filter((contract): contract is ContractLookup => Boolean(contract.id));
}

function isLowConfidenceContract(contract: DashboardContractRow) {
  return (
    contract.contract_metadata?.needs_review === true ||
    contract.contract_metadata?.financial_data_trust_status === "low" ||
    contract.contract_metadata?.financial_data_trust_status === "blocked"
  );
}

function isDecisionGap(contract: DashboardContractRow) {
  return (
    (contract.renewal_decision_status ?? "undecided") === "undecided" &&
    contract.cycle_status !== "closed" &&
    contract.cycle_status !== "superseded"
  );
}

function hasAnyRenewalControlDate(contract: DashboardContractRow) {
  return Boolean(
    contract.contract_metadata?.notice_deadline_date ||
      contract.contract_metadata?.renewal_date ||
      contract.contract_metadata?.expiration_date
  );
}

function isDueSoon(contract: DashboardContractRow, horizonDays = 30) {
  const today = startOfDay(new Date());
  const horizon = addDays(today, horizonDays);
  const candidates = [
    contract.contract_metadata?.notice_deadline_date,
    contract.contract_metadata?.renewal_date,
    contract.contract_metadata?.expiration_date
  ]
    .filter(Boolean)
    .map((value) => startOfDay(parseISO(value!)));

  return candidates.some((date) => date >= today && date <= horizon);
}

function toFinancialContractInput(contract: DashboardContractRow): FinancialExposureContractInput {
  return {
    contract_id: contract.id ?? "",
    contract_value_amount: contract.contract_metadata?.contract_value_amount ?? null,
    contract_value_currency: contract.contract_metadata?.contract_value_currency ?? null,
    contract_value_period:
      (contract.contract_metadata?.contract_value_period as FinancialExposureContractInput["contract_value_period"]) ??
      null,
    price_change_trigger: contract.contract_metadata?.price_change_trigger ?? null,
    payment_trigger: contract.contract_metadata?.payment_trigger ?? null,
    renewal_date: contract.contract_metadata?.renewal_date ?? null,
    expiration_date: contract.contract_metadata?.expiration_date ?? null,
    notice_deadline_date: contract.contract_metadata?.notice_deadline_date ?? null,
    auto_renewal: contract.contract_metadata?.auto_renewal ?? null,
    renewal_term: null,
    department: contract.department ?? null,
    owner_user_id: contract.owner_user_id ?? null,
    counterparty_name: contract.contract_metadata?.counterparty_name ?? null,
    decision_status: contract.renewal_decision_status ?? "undecided",
    trust_status: contract.contract_metadata?.needs_review ? "Needs Review" : "Verified",
    financial_data_trust_status:
      (contract.contract_metadata?.financial_data_trust_status as FinancialExposureContractInput["financial_data_trust_status"]) ??
      null
  };
}

function deriveRowTrustLevel(contracts: DashboardContractRow[], baseTrust: IntelligenceTrustLevel) {
  const lowConfidenceCount = contracts.filter(isLowConfidenceContract).length;

  if (baseTrust === "blocked" || contracts.length === 0) return "blocked" as const;
  if (lowConfidenceCount === 0) return baseTrust;
  if (lowConfidenceCount === contracts.length) return "low" as const;
  if (baseTrust === "high") return "medium" as const;
  return baseTrust;
}

function buildLowConfidenceWarnings(contracts: DashboardContractRow[], contextLabel: string) {
  const lowConfidenceCount = contracts.filter(isLowConfidenceContract).length;
  if (lowConfidenceCount === 0) return [];

  return [
    createWarning(
      "low_confidence_contracts",
      `${lowConfidenceCount} ${contextLabel} contract${lowConfidenceCount === 1 ? "" : "s"} remain unreviewed or low-confidence.`,
      "warning"
    )
  ];
}

function summarizeExposureGroup(input: {
  key: string;
  label: string;
  contracts: DashboardContractRow[];
  duplicateSuggestions?: CounterpartyRecord["duplicate_suggestions"];
  latestDecisionDate?: string | null;
}) {
  const exposure = calculateRenewalExposure(input.contracts.map(toFinancialContractInput));
  const lowConfidenceWarnings = buildLowConfidenceWarnings(input.contracts, input.label);

  return {
    key: input.key,
    label: input.label,
    contract_count: input.contracts.length,
    low_confidence_contract_count: input.contracts.filter(isLowConfidenceContract).length,
    owner_missing_contract_count: input.contracts.filter((contract) => !contract.owner_user_id).length,
    decision_gap_contract_count: input.contracts.filter(isDecisionGap).length,
    due_soon_contract_count: input.contracts.filter((contract) => isDueSoon(contract)).length,
    auto_renewal_contract_count: input.contracts.filter(
      (contract) => contract.contract_metadata?.auto_renewal === true
    ).length,
    drilldown_contract_ids: input.contracts.map((contract) => contract.id ?? "").filter(Boolean),
    trust_level: deriveRowTrustLevel(input.contracts, exposure.trust_level),
    warnings: [...exposure.warnings, ...lowConfidenceWarnings],
    exposure_amount: exposure.amount,
    exposure_currency: exposure.currency,
    latest_decision_date: input.latestDecisionDate ?? null,
    duplicate_suggestions: input.duplicateSuggestions
  } satisfies ProcurementAnalyticsRow;
}

function buildSummary(slug: string, title: string, rows: ProcurementAnalyticsRow[]): ProcurementAnalyticsSummary {
  return {
    slug,
    title,
    rows,
    total_contract_count: rows.reduce((sum, row) => sum + row.contract_count, 0),
    low_confidence_contract_count: rows.reduce(
      (sum, row) => sum + row.low_confidence_contract_count,
      0
    ),
    warnings: dedupeWarnings(rows.flatMap((row) => row.warnings)),
    calculation_basis: buildTrustedWorkflowBasis(slug)
  };
}

function groupContracts<TKey extends string>(
  contracts: DashboardContractRow[],
  makeKey: (contract: DashboardContractRow) => TKey,
  makeLabel: (contract: DashboardContractRow) => string
) {
  const groups = new Map<
    TKey,
    {
      label: string;
      contracts: DashboardContractRow[];
    }
  >();

  for (const contract of contracts) {
    const key = makeKey(contract);
    const entry = groups.get(key);

    if (entry) {
      entry.contracts.push(contract);
      continue;
    }

    groups.set(key, {
      label: makeLabel(contract),
      contracts: [contract]
    });
  }

  return groups;
}

function sortRows(rows: ProcurementAnalyticsRow[]) {
  return rows.sort((left, right) => {
    const leftAmount = left.exposure_amount ?? -1;
    const rightAmount = right.exposure_amount ?? -1;

    if (rightAmount !== leftAmount) return rightAmount - leftAmount;
    if (right.contract_count !== left.contract_count) return right.contract_count - left.contract_count;
    return left.label.localeCompare(right.label);
  });
}

function dedupeWarnings(warnings: IntelligenceWarning[]) {
  const seen = new Set<string>();
  return warnings.filter((warning) => {
    const key = `${warning.code}:${warning.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCounterpartyLabel(
  contract: DashboardContractRow,
  counterpartyMap: Map<string, CounterpartyRecord>
) {
  if (contract.counterparty_id && counterpartyMap.has(contract.counterparty_id)) {
    return counterpartyMap.get(contract.counterparty_id)?.name ?? "Unknown vendor";
  }

  return contract.contract_metadata?.counterparty_name?.trim() || "Unknown vendor";
}

function applyProcurementFilters(
  contracts: ContractLookup[],
  counterpartyMap: Map<string, CounterpartyRecord>,
  filters: ProcurementAnalyticsFilters
) {
  return contracts.filter((contract) => {
    if (filters.department && contract.department !== filters.department) return false;
    if (filters.ownerUserId && contract.owner_user_id !== filters.ownerUserId) return false;

    if (filters.counterpartyName) {
      const label = getCounterpartyLabel(contract, counterpartyMap);
      if (label !== filters.counterpartyName) return false;
    }

    if (filters.dueWindowDays && !isDueSoon(contract, filters.dueWindowDays)) return false;

    if (filters.trustStatus === "verified" && isLowConfidenceContract(contract)) return false;
    if (filters.trustStatus === "low_confidence" && !isLowConfidenceContract(contract)) return false;

    return true;
  });
}

async function loadRawProcurementAnalyticsContext(
  organizationId: string
): Promise<ProcurementAnalyticsContext> {
  const [contracts, counterparties, decisions] = await Promise.all([
    getContracts(organizationId, "all"),
    getCounterparties(organizationId),
    getRenewalDecisionAnalyticsRows(organizationId)
  ]);

  const typedContracts = toContractLookupRows(contracts);
  const counterpartyMap = new Map(counterparties.map((counterparty) => [counterparty.id, counterparty]));
  const contractIdSet = new Set(typedContracts.map((contract) => contract.id));
  const scopedDecisions = decisions.filter(
    (decision) =>
      decision.organization_id === organizationId && contractIdSet.has(decision.contract_id)
  );

  return {
    contracts: typedContracts,
    counterparties,
    counterpartyMap,
    decisions: scopedDecisions
  };
}

async function loadProcurementAnalyticsContext(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const rawContext = await loadRawProcurementAnalyticsContext(organizationId);
  const filteredContracts = applyProcurementFilters(
    rawContext.contracts,
    rawContext.counterpartyMap,
    filters
  );
  const filteredContractIds = new Set(filteredContracts.map((contract) => contract.id));

  return {
    rawContext,
    context: {
      contracts: filteredContracts,
      counterparties: rawContext.counterparties,
      counterpartyMap: rawContext.counterpartyMap,
      decisions: rawContext.decisions.filter((decision) => filteredContractIds.has(decision.contract_id))
    } satisfies ProcurementAnalyticsContext
  };
}

function buildVendorExposureSummary(context: ProcurementAnalyticsContext) {
  const groups = groupContracts(
    context.contracts,
    (contract) =>
      contract.counterparty_id
        ? `counterparty:${contract.counterparty_id}`
        : `name:${getCounterpartyLabel(contract, context.counterpartyMap)}`,
    (contract) => getCounterpartyLabel(contract, context.counterpartyMap)
  );

  const rows = Array.from(groups.entries()).map(([key, value]) =>
    summarizeExposureGroup({
      key,
      label: value.label,
      contracts: value.contracts
    })
  );

  return buildSummary(
    "procurement.vendor_exposure_summary",
    "Vendor exposure summary",
    sortRows(rows)
  );
}

function buildDepartmentExposureSummary(context: ProcurementAnalyticsContext) {
  const groups = groupContracts(
    context.contracts,
    (contract) => `department:${contract.department?.trim() || "unassigned"}`,
    (contract) => contract.department?.trim() || "Unassigned department"
  );

  const rows = Array.from(groups.entries()).map(([key, value]) =>
    summarizeExposureGroup({
      key,
      label: value.label,
      contracts: value.contracts
    })
  );

  return buildSummary(
    "procurement.department_exposure_summary",
    "Department exposure summary",
    sortRows(rows)
  );
}

function buildOwnerCoverageSummary(context: ProcurementAnalyticsContext) {
  const groups = groupContracts(
    context.contracts,
    (contract) => `owner:${contract.owner_user_id ?? "unassigned"}`,
    (contract) => contract.owner_name?.trim() || "Unassigned owner"
  );

  const rows = Array.from(groups.entries()).map(([key, value]) =>
    summarizeExposureGroup({
      key,
      label: value.label,
      contracts: value.contracts
    })
  );

  return buildSummary(
    "procurement.owner_coverage_summary",
    "Owner coverage summary",
    sortRows(rows)
  );
}

function buildDecisionGapSummary(context: ProcurementAnalyticsContext) {
  const gapContracts = context.contracts.filter(isDecisionGap);
  const decidedContracts = context.contracts.filter(
    (contract) => !gapContracts.some((gapContract) => gapContract.id === contract.id)
  );

  return buildSummary("procurement.decision_gap_summary", "Decision gap summary", [
    summarizeExposureGroup({
      key: "decision_gap",
      label: "Decision gap",
      contracts: gapContracts
    }),
    summarizeExposureGroup({
      key: "decision_recorded",
      label: "Decision recorded",
      contracts: decidedContracts
    })
  ]);
}

function buildDueSoonVendorConcentration(context: ProcurementAnalyticsContext) {
  const dueSoonContracts = context.contracts.filter(
    (contract) => hasAnyRenewalControlDate(contract) && isDueSoon(contract)
  );
  const groups = groupContracts(
    dueSoonContracts,
    (contract) =>
      contract.counterparty_id
        ? `counterparty:${contract.counterparty_id}`
        : `name:${getCounterpartyLabel(contract, context.counterpartyMap)}`,
    (contract) => getCounterpartyLabel(contract, context.counterpartyMap)
  );

  const rows = Array.from(groups.entries()).map(([key, value]) =>
    summarizeExposureGroup({
      key,
      label: value.label,
      contracts: value.contracts
    })
  );

  return buildSummary(
    "procurement.due_soon_vendor_concentration",
    "Due-soon vendor concentration",
    sortRows(rows)
  );
}

function buildDuplicateCounterpartySummary(context: ProcurementAnalyticsContext) {
  const contractIdsByCounterparty = new Map<string, string[]>();

  for (const contract of context.contracts) {
    if (!contract.counterparty_id) continue;
    const existing = contractIdsByCounterparty.get(contract.counterparty_id) ?? [];
    existing.push(contract.id);
    contractIdsByCounterparty.set(contract.counterparty_id, existing);
  }

  const rows = context.counterparties
    .filter((counterparty) => counterparty.duplicate_suggestions.length > 0)
    .map((counterparty) => ({
      key: counterparty.id,
      label: counterparty.name,
      contract_count: contractIdsByCounterparty.get(counterparty.id)?.length ?? 0,
      low_confidence_contract_count: 0,
      owner_missing_contract_count: 0,
      decision_gap_contract_count: 0,
      due_soon_contract_count: 0,
      auto_renewal_contract_count: 0,
      drilldown_contract_ids: contractIdsByCounterparty.get(counterparty.id) ?? [],
      trust_level: "medium" as const,
      warnings: [
        createWarning(
          "duplicate_counterparty_suspected",
          `${counterparty.duplicate_suggestions.length} duplicate vendor match${counterparty.duplicate_suggestions.length === 1 ? "" : "es"} should be reviewed.`,
          "warning"
        )
      ],
      exposure_amount: null,
      exposure_currency: null,
      duplicate_suggestions: counterparty.duplicate_suggestions
    } satisfies ProcurementAnalyticsRow))
    .filter((row) => row.drilldown_contract_ids.length > 0)
    .sort((left, right) => right.contract_count - left.contract_count || left.label.localeCompare(right.label));

  return buildSummary(
    "procurement.duplicate_counterparty_summary",
    "Duplicate counterparty summary",
    rows
  );
}

function buildRenewalOutcomeHistory(context: ProcurementAnalyticsContext) {
  const contractMap = new Map(context.contracts.map((contract) => [contract.id, contract]));
  const groups = new Map<
    string,
    {
      label: string;
      contractIds: string[];
      decisions: RenewalDecisionAnalyticsRecord[];
      contracts: DashboardContractRow[];
    }
  >();

  for (const decision of context.decisions) {
    const contract = contractMap.get(decision.contract_id);
    if (!contract) continue;

    const key = decision.status;
    const label = formatDecisionStatusLabel(decision.status);
    const existing = groups.get(key);

    if (existing) {
      existing.contractIds.push(decision.contract_id);
      existing.decisions.push(decision);
      existing.contracts.push(contract);
      continue;
    }

    groups.set(key, {
      label,
      contractIds: [decision.contract_id],
      decisions: [decision],
      contracts: [contract]
    });
  }

  const rows = Array.from(groups.entries()).map(([key, value]) => {
    const exposure = calculateRenewalExposure(value.contracts.map(toFinancialContractInput));
    return {
      key,
      label: value.label,
      contract_count: value.contractIds.length,
      low_confidence_contract_count: value.contracts.filter(isLowConfidenceContract).length,
      owner_missing_contract_count: value.contracts.filter((contract) => !contract.owner_user_id).length,
      decision_gap_contract_count: value.contracts.filter(isDecisionGap).length,
      due_soon_contract_count: value.contracts.filter((contract) => isDueSoon(contract)).length,
      auto_renewal_contract_count: value.contracts.filter(
        (contract) => contract.contract_metadata?.auto_renewal === true
      ).length,
      drilldown_contract_ids: Array.from(new Set(value.contractIds)),
      trust_level: deriveRowTrustLevel(value.contracts, exposure.trust_level),
      warnings: [...exposure.warnings, ...buildLowConfidenceWarnings(value.contracts, value.label)],
      exposure_amount: exposure.amount,
      exposure_currency: exposure.currency,
      latest_decision_date:
        value.decisions
          .map((decision) => decision.decision_date ?? decision.created_at)
          .filter(Boolean)
          .sort()
          .at(-1) ?? null
    } satisfies ProcurementAnalyticsRow;
  });

  return buildSummary(
    "procurement.renewal_outcome_history",
    "Renewal outcome history",
    rows.sort((left, right) => (right.latest_decision_date ?? "").localeCompare(left.latest_decision_date ?? ""))
  );
}

function buildAutoRenewalConcentrationSummary(context: ProcurementAnalyticsContext) {
  const autoRenewalContracts = context.contracts.filter(
    (contract) => contract.contract_metadata?.auto_renewal === true
  );
  const groups = groupContracts(
    autoRenewalContracts,
    (contract) =>
      contract.counterparty_id
        ? `counterparty:${contract.counterparty_id}`
        : `name:${getCounterpartyLabel(contract, context.counterpartyMap)}`,
    (contract) => getCounterpartyLabel(contract, context.counterpartyMap)
  );

  const rows = Array.from(groups.entries()).map(([key, value]) => {
    const exposure = calculateAutoRenewalExposure(value.contracts.map(toFinancialContractInput));
    return {
      ...summarizeExposureGroup({
        key,
        label: value.label,
        contracts: value.contracts
      }),
      exposure_amount: exposure.amount,
      exposure_currency: exposure.currency,
      trust_level: deriveRowTrustLevel(value.contracts, exposure.trust_level),
      warnings: [...exposure.warnings, ...buildLowConfidenceWarnings(value.contracts, value.label)]
    } satisfies ProcurementAnalyticsRow;
  });

  return buildSummary(
    "procurement.auto_renewal_concentration",
    "Auto-renewal concentration",
    sortRows(rows)
  );
}

function buildFilterOptions(rawContext: ProcurementAnalyticsContext): ProcurementAnalyticsFilterOptions {
  return {
    departments: Array.from(
      new Set(rawContext.contracts.map((contract) => contract.department).filter(Boolean))
    ).sort() as string[],
    owners: Array.from(
      new Map(
        rawContext.contracts
          .filter((contract) => contract.owner_user_id)
          .map((contract) => [
            contract.owner_user_id!,
            contract.owner_name?.trim() || contract.owner_user_id!
          ])
      )
    )
      .map(([user_id, label]) => ({ user_id, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    counterparties: Array.from(
      new Set(rawContext.contracts.map((contract) => getCounterpartyLabel(contract, rawContext.counterpartyMap)))
    ).sort(),
    dueWindows: PROCUREMENT_DUE_WINDOWS,
    trustStatuses: PROCUREMENT_TRUST_FILTERS
  };
}

function buildEmptyState(
  rawContext: ProcurementAnalyticsContext,
  filteredContracts: ContractLookup[]
): ProcurementAnalyticsEmptyState | null {
  if (rawContext.contracts.length === 0) {
    return {
      title: "Import contracts first",
      description: "Procurement analytics starts only after contract rows exist in the renewal-control workflow.",
      actionLabel: "Upload or import contracts",
      actionHref: "/dashboard/contracts/new"
    };
  }

  if (filteredContracts.length === 0) {
    return {
      title: "No contracts match these filters",
      description: "Clear or widen the current filters to see renewal portfolio work again.",
      actionLabel: "View all contracts",
      actionHref: "/dashboard/contracts"
    };
  }

  if (filteredContracts.every((contract) => contract.contract_metadata?.needs_review)) {
    return {
      title: "Review P0 before portfolio rollups become trustworthy",
      description: "These contracts still need reviewed notice, renewal, or expiration truth before the analytics should guide action.",
      actionLabel: "Review contracts",
      actionHref: "/dashboard/contracts?filter=needs_review"
    };
  }

  if (filteredContracts.every((contract) => !contract.owner_user_id)) {
    return {
      title: "Assign owners before portfolio work can move",
      description: "Owner gaps block accountability and make the renewal portfolio hard to act on.",
      actionLabel: "Assign owners",
      actionHref: "/dashboard/contracts"
    };
  }

  if (
    filteredContracts.every(
      (contract) =>
        contract.contract_metadata?.contract_value_amount == null ||
        !contract.contract_metadata?.contract_value_currency
    )
  ) {
    return {
      title: "Add contract value before exposure becomes useful",
      description: "Procurement analytics stays conservative until contract value and currency are present.",
      actionLabel: "Open contracts",
      actionHref: "/dashboard/contracts"
    };
  }

  return null;
}

function formatDecisionStatusLabel(status: string) {
  switch (status) {
    case "renew":
      return "Renewed";
    case "terminate":
      return "Terminated";
    case "renegotiate":
      return "Renegotiated";
    case "defer":
      return "Deferred";
    case "no_action_required":
      return "No action required";
    default:
      return "Undecided";
  }
}

export async function getVendorExposureSummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildVendorExposureSummary(context);
}

export async function getDepartmentExposureSummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildDepartmentExposureSummary(context);
}

export async function getOwnerCoverageSummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildOwnerCoverageSummary(context);
}

export async function getDecisionGapSummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildDecisionGapSummary(context);
}

export async function getDueSoonVendorConcentration(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildDueSoonVendorConcentration(context);
}

export async function getDuplicateCounterpartySummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildDuplicateCounterpartySummary(context);
}

export async function getRenewalOutcomeHistory(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildRenewalOutcomeHistory(context);
}

export async function getAutoRenewalConcentrationSummary(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
) {
  const { context } = await loadProcurementAnalyticsContext(organizationId, filters);
  return buildAutoRenewalConcentrationSummary(context);
}

export async function getProcurementAnalyticsDashboard(
  organizationId: string,
  filters: ProcurementAnalyticsFilters = {}
): Promise<ProcurementAnalyticsDashboard> {
  const normalizedTrustStatus = normalizeProcurementTrustFilter(filters.trustStatus);
  const normalizedDueWindow = filters.dueWindowDays ?? null;
  const { rawContext, context } = await loadProcurementAnalyticsContext(organizationId, {
    department: filters.department ?? null,
    ownerUserId: filters.ownerUserId ?? null,
    counterpartyName: filters.counterpartyName ?? null,
    dueWindowDays: normalizedDueWindow,
    trustStatus: normalizedTrustStatus
  });

  const vendorExposureSummary = buildVendorExposureSummary(context);
  const departmentExposureSummary = buildDepartmentExposureSummary(context);
  const ownerCoverageSummary = buildOwnerCoverageSummary(context);
  const decisionGapSummary = buildDecisionGapSummary(context);
  const dueSoonVendorConcentration = buildDueSoonVendorConcentration(context);
  const duplicateCounterpartySummary = buildDuplicateCounterpartySummary(context);
  const renewalOutcomeHistory = buildRenewalOutcomeHistory(context);
  const autoRenewalConcentrationSummary = buildAutoRenewalConcentrationSummary(context);

  return {
    filters: {
      department: filters.department ?? "",
      ownerUserId: filters.ownerUserId ?? "",
      counterpartyName: filters.counterpartyName ?? "",
      dueWindowDays: normalizedDueWindow ? String(normalizedDueWindow) : "",
      trustStatus: normalizedTrustStatus
    },
    filterOptions: buildFilterOptions(rawContext),
    emptyState: buildEmptyState(rawContext, context.contracts),
    totalContractsInScope: context.contracts.length,
    lowConfidenceContractCount: context.contracts.filter(isLowConfidenceContract).length,
    reviewedContractCount: context.contracts.filter(
      (contract) => !contract.contract_metadata?.needs_review
    ).length,
    ownerAssignedContractCount: context.contracts.filter((contract) => Boolean(contract.owner_user_id)).length,
    valuedContractCount: context.contracts.filter(
      (contract) =>
        contract.contract_metadata?.contract_value_amount != null &&
        Boolean(contract.contract_metadata?.contract_value_currency)
    ).length,
    vendorExposureSummary,
    departmentExposureSummary,
    ownerCoverageSummary,
    decisionGapSummary,
    dueSoonVendorConcentration,
    duplicateCounterpartySummary,
    renewalOutcomeHistory,
    autoRenewalConcentrationSummary,
    combinedWarnings: dedupeWarnings([
      ...vendorExposureSummary.warnings,
      ...departmentExposureSummary.warnings,
      ...ownerCoverageSummary.warnings,
      ...decisionGapSummary.warnings,
      ...dueSoonVendorConcentration.warnings,
      ...duplicateCounterpartySummary.warnings,
      ...renewalOutcomeHistory.warnings,
      ...autoRenewalConcentrationSummary.warnings
    ])
  };
}
