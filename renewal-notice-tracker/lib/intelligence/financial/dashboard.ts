import { addDays, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import {
  calculateAutoRenewalExposure,
  calculatePriceChangeExposure,
  calculateRenewalExposure,
  calculateUndecidedExposure,
  calculateUnownedExposure,
  calculateUnreviewedExposure
} from "@/lib/intelligence/financial/exposure";
import type {
  FinancialExposureContractInput,
  FinancialExposureResult
} from "@/lib/intelligence/financial/model";
import type { IntelligenceTrustLevel, IntelligenceWarning } from "@/lib/intelligence/shared/types";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

export const FINANCIAL_EXPOSURE_HORIZONS = [30, 60, 90, 180] as const;

export const FINANCIAL_DRILLDOWN_VIEWS = [
  "renewal_exposure",
  "auto_renewal_exposure",
  "unowned_exposure",
  "undecided_exposure",
  "unreviewed_exposure",
  "price_change_exposure"
] as const;

export type FinancialDrilldownView = (typeof FINANCIAL_DRILLDOWN_VIEWS)[number];

export type FinancialExposureCardData = {
  slug: string;
  title: string;
  description: string;
  valueLabel: string;
  trustLabel: string;
  trustLevel: IntelligenceTrustLevel;
  warnings: IntelligenceWarning[];
  href: string;
  includedContractCount: number;
  excludedContractCount: number;
  emptyState: string | null;
};

export type FinancialExposureBreakdownRow = {
  key: string;
  label: string;
  valueLabel: string;
  trustLabel: string;
  trustLevel: IntelligenceTrustLevel;
  warnings: IntelligenceWarning[];
  href: string;
  includedContractCount: number;
};

export type FinancialDashboardView = {
  cards: FinancialExposureCardData[];
  exposureByCounterparty: FinancialExposureBreakdownRow[];
  exposureByDepartment: FinancialExposureBreakdownRow[];
  exposureByOwner: FinancialExposureBreakdownRow[];
  warnings: IntelligenceWarning[];
  emptyState: string | null;
  lowTrustContractCount: number;
  missingFinancialValueCount: number;
};

export type FinancialDrilldownParams = {
  financialView?: string;
  horizonDays?: string;
  counterpartyName?: string;
  unassignedOwner?: string;
  unassignedDepartment?: string;
  owner?: string;
  department?: string;
};

export function isFinancialDrilldownView(value: string | null | undefined): value is FinancialDrilldownView {
  return FINANCIAL_DRILLDOWN_VIEWS.includes(value as FinancialDrilldownView);
}

export function normalizeFinancialHorizon(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return FINANCIAL_EXPOSURE_HORIZONS.includes(parsed as (typeof FINANCIAL_EXPOSURE_HORIZONS)[number])
    ? (parsed as (typeof FINANCIAL_EXPOSURE_HORIZONS)[number])
    : null;
}

export function mapDashboardContractToFinancialInput(
  contract: DashboardContractRow
): FinancialExposureContractInput {
  const metadata = contract.contract_metadata;

  return {
    contract_id: contract.id ?? "",
    contract_value_amount: metadata?.contract_value_amount ?? null,
    contract_value_currency: metadata?.contract_value_currency ?? null,
    contract_value_period:
      (metadata?.contract_value_period as FinancialExposureContractInput["contract_value_period"]) ??
      null,
    price_change_trigger: metadata?.price_change_trigger ?? null,
    payment_trigger: metadata?.payment_trigger ?? null,
    renewal_date: metadata?.renewal_date ?? null,
    expiration_date: metadata?.expiration_date ?? null,
    notice_deadline_date: metadata?.notice_deadline_date ?? null,
    auto_renewal: metadata?.auto_renewal ?? null,
    renewal_term: null,
    department: contract.department ?? null,
    owner_user_id: contract.owner_user_id ?? null,
    counterparty_name: metadata?.counterparty_name ?? null,
    decision_status: contract.renewal_decision_status ?? "undecided",
    trust_status: deriveContractTrustStatus(contract),
    financial_data_trust_status:
      (metadata?.financial_data_trust_status as FinancialExposureContractInput["financial_data_trust_status"]) ??
      null
  };
}

export function buildFinancialDashboardView(
  contracts: DashboardContractRow[]
): FinancialDashboardView {
  const financialContracts = contracts.map(mapDashboardContractToFinancialInput);
  const renewalCards = FINANCIAL_EXPOSURE_HORIZONS.map((days) => {
    const matchingContracts = contracts.filter((contract) => isContractDueWithinHorizon(contract, days));
    return buildExposureCard({
      slug: `renewal_exposure_${days}_days`,
      title: `Renewal exposure next ${days} days`,
      description:
        days === 30
          ? "Reviewed notice, renewal, or expiration obligations already entering the near-term working loop."
          : "Reviewed obligations approaching the working queue without pretending to forecast spend beyond confirmed workflow dates.",
      href: buildDrilldownHref({
        financialView: "renewal_exposure",
        horizonDays: String(days)
      }),
      result: calculateRenewalExposure(matchingContracts.map(mapDashboardContractToFinancialInput))
    });
  });

  const cards: FinancialExposureCardData[] = [
    ...renewalCards,
    buildExposureCard({
      slug: "auto_renewal_exposure",
      title: "Auto-renewal exposure",
      description: "Confirmed auto-renewal value at risk if owners and decisions are still lagging.",
      href: buildDrilldownHref({ financialView: "auto_renewal_exposure" }),
      result: calculateAutoRenewalExposure(financialContracts)
    }),
    buildExposureCard({
      slug: "unowned_exposure",
      title: "Unowned exposure",
      description: "Value sitting outside the trusted workflow because no accountable owner is assigned.",
      href: buildDrilldownHref({ financialView: "unowned_exposure" }),
      result: calculateUnownedExposure(financialContracts)
    }),
    buildExposureCard({
      slug: "undecided_exposure",
      title: "Undecided exposure",
      description: "Reviewed contract value still missing an explicit renewal decision.",
      href: buildDrilldownHref({ financialView: "undecided_exposure" }),
      result: calculateUndecidedExposure(financialContracts)
    }),
    buildExposureCard({
      slug: "unreviewed_exposure",
      title: "Unreviewed exposure",
      description: "Low-trust imported value still blocked from reviewed workflow truth.",
      href: buildDrilldownHref({ financialView: "unreviewed_exposure" }),
      result: calculateUnreviewedExposure(financialContracts, {
        lowTrustValuePolicy: "include"
      })
    }),
    buildExposureCard({
      slug: "price_change_exposure",
      title: "Price-change exposure",
      description: "Reviewed contract value carrying a confirmed price-change trigger.",
      href: buildDrilldownHref({ financialView: "price_change_exposure" }),
      result: calculatePriceChangeExposure(financialContracts)
    })
  ];

  const warnings = dedupeWarnings(cards.flatMap((card) => card.warnings));
  const lowTrustContractCount = financialContracts.filter(
    (contract) =>
      contract.financial_data_trust_status === "low" || contract.trust_status === "Needs Review"
  ).length;
  const missingFinancialValueCount = financialContracts.filter(
    (contract) => contract.contract_value_amount === null || !contract.contract_value_currency
  ).length;

  return {
    cards,
    exposureByCounterparty: buildExposureBreakdown(contracts, "counterparty"),
    exposureByDepartment: buildExposureBreakdown(contracts, "department"),
    exposureByOwner: buildExposureBreakdown(contracts, "owner"),
    warnings,
    emptyState:
      contracts.length === 0
        ? "Upload or import contracts first. Financial exposure starts only after reviewed contracts have a contract value, currency, and at least one renewal-control date."
        : cards.every((card) => card.includedContractCount === 0)
          ? "Financial exposure stays empty until contracts carry a contract value, currency, and reviewed renewal-control dates."
          : null,
    lowTrustContractCount,
    missingFinancialValueCount
  };
}

export function filterContractsForFinancialDrilldown(
  contracts: DashboardContractRow[],
  params: FinancialDrilldownParams
) {
  const horizonDays = normalizeFinancialHorizon(params.horizonDays);
  const financialView = isFinancialDrilldownView(params.financialView) ? params.financialView : null;

  return contracts.filter((contract) => {
    if (params.counterpartyName) {
      const counterpartyName = contract.contract_metadata?.counterparty_name ?? "";
      if (counterpartyName !== params.counterpartyName) {
        return false;
      }
    }

    if (params.unassignedOwner === "1" && contract.owner_user_id) {
      return false;
    }

    if (params.unassignedDepartment === "1" && contract.department) {
      return false;
    }

    if (!financialView) return true;

    switch (financialView) {
      case "renewal_exposure":
        return horizonDays ? isContractDueWithinHorizon(contract, horizonDays) : hasAnyRenewalControlDate(contract);
      case "auto_renewal_exposure":
        return contract.contract_metadata?.auto_renewal === true;
      case "unowned_exposure":
        return !contract.owner_user_id;
      case "undecided_exposure":
        return (contract.renewal_decision_status ?? "undecided") === "undecided";
      case "unreviewed_exposure":
        return contract.contract_metadata?.needs_review === true;
      case "price_change_exposure":
        return Boolean(contract.contract_metadata?.price_change_trigger);
      default:
        return true;
    }
  });
}

export function describeFinancialDrilldown(params: FinancialDrilldownParams) {
  const financialView = isFinancialDrilldownView(params.financialView) ? params.financialView : null;
  const horizonDays = normalizeFinancialHorizon(params.horizonDays);

  if (!financialView) return null;

  switch (financialView) {
    case "renewal_exposure":
      return horizonDays
        ? `Viewing renewal exposure next ${horizonDays} days for the active organization.`
        : "Viewing renewal exposure for the active organization.";
    case "auto_renewal_exposure":
      return "Viewing confirmed auto-renewal exposure for the active organization.";
    case "unowned_exposure":
      return "Viewing unowned financial exposure for the active organization.";
    case "undecided_exposure":
      return "Viewing undecided financial exposure for the active organization.";
    case "unreviewed_exposure":
      return "Viewing low-trust unreviewed financial exposure for the active organization.";
    case "price_change_exposure":
      return "Viewing price-change exposure for the active organization.";
    default:
      return null;
  }
}

function buildExposureBreakdown(
  contracts: DashboardContractRow[],
  groupBy: "counterparty" | "department" | "owner"
) {
  const groups = new Map<
    string,
    {
      label: string;
      href: string;
      contracts: DashboardContractRow[];
    }
  >();

  for (const contract of contracts) {
    const descriptor = getGroupDescriptor(contract, groupBy);
    const entry = groups.get(descriptor.key);

    if (entry) {
      entry.contracts.push(contract);
      continue;
    }

    groups.set(descriptor.key, {
      label: descriptor.label,
      href: descriptor.href,
      contracts: [contract]
    });
  }

  return Array.from(groups.entries())
    .map(([key, value]) => {
      const result = calculateRenewalExposure(
        value.contracts.map(mapDashboardContractToFinancialInput)
      );

      return {
        key,
        label: value.label,
        valueLabel: formatExposureValue(result),
        trustLabel: formatTrustLabel(result.trust_level),
        trustLevel: result.trust_level,
        warnings: result.warnings,
        href: value.href,
        includedContractCount: result.included_contract_count
      } satisfies FinancialExposureBreakdownRow;
    })
    .sort((left, right) => compareExposureRows(left, right));
}

function getGroupDescriptor(
  contract: DashboardContractRow,
  groupBy: "counterparty" | "department" | "owner"
) {
  if (groupBy === "counterparty") {
    const label = contract.contract_metadata?.counterparty_name?.trim() || "Unknown counterparty";
    return {
      key: `counterparty:${label}`,
      label,
      href: buildDrilldownHref({
        financialView: "renewal_exposure",
        counterpartyName: label
      })
    };
  }

  if (groupBy === "department") {
    const label = contract.department?.trim() || "Unassigned department";
    return {
      key: `department:${label}`,
      label,
      href: buildDrilldownHref({
        financialView: "renewal_exposure",
        department: label === "Unassigned department" ? undefined : label,
        unassignedDepartment: label === "Unassigned department" ? "1" : undefined
      })
    };
  }

  const label = contract.owner_name?.trim() || "Unassigned owner";
  return {
    key: `owner:${contract.owner_user_id ?? label}`,
    label,
    href: buildDrilldownHref({
      financialView: contract.owner_user_id ? "renewal_exposure" : "unowned_exposure",
      owner: contract.owner_user_id ?? undefined,
      unassignedOwner: contract.owner_user_id ? undefined : "1"
    })
  };
}

function buildExposureCard(input: {
  slug: string;
  title: string;
  description: string;
  href: string;
  result: FinancialExposureResult;
}): FinancialExposureCardData {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    valueLabel: formatExposureValue(input.result),
    trustLabel: formatTrustLabel(input.result.trust_level),
    trustLevel: input.result.trust_level,
    warnings: input.result.warnings,
    href: input.href,
    includedContractCount: input.result.included_contract_count,
    excludedContractCount: input.result.excluded_contract_count,
    emptyState:
      input.result.included_contract_count === 0
        ? "Needs reviewed contract value, currency, and trusted workflow dates before exposure can be summed."
        : null
  };
}

function buildDrilldownHref(params: {
  financialView?: FinancialDrilldownView;
  horizonDays?: string;
  counterpartyName?: string;
  department?: string;
  owner?: string;
  unassignedOwner?: string;
  unassignedDepartment?: string;
}) {
  const searchParams = new URLSearchParams();

  if (params.financialView) searchParams.set("financialView", params.financialView);
  if (params.horizonDays) searchParams.set("horizonDays", params.horizonDays);
  if (params.counterpartyName) searchParams.set("counterpartyName", params.counterpartyName);
  if (params.department) searchParams.set("department", params.department);
  if (params.owner) searchParams.set("owner", params.owner);
  if (params.unassignedOwner) searchParams.set("unassignedOwner", params.unassignedOwner);
  if (params.unassignedDepartment) searchParams.set("unassignedDepartment", params.unassignedDepartment);

  const query = searchParams.toString();
  return query ? `/dashboard/contracts?${query}` : "/dashboard/contracts";
}

function hasAnyRenewalControlDate(contract: DashboardContractRow) {
  return Boolean(
    contract.contract_metadata?.notice_deadline_date ||
      contract.contract_metadata?.renewal_date ||
      contract.contract_metadata?.expiration_date
  );
}

function isContractDueWithinHorizon(contract: DashboardContractRow, horizonDays: number) {
  const today = startOfDay(new Date());
  const horizon = addDays(today, horizonDays);
  const nextRelevantDate = getNextRelevantDate(contract);

  if (!nextRelevantDate) return false;

  const dueDate = startOfDay(parseISO(nextRelevantDate));
  return dueDate >= today && dueDate <= horizon;
}

function getNextRelevantDate(contract: DashboardContractRow) {
  const today = startOfDay(new Date());
  const candidates = [
    contract.contract_metadata?.notice_deadline_date,
    contract.contract_metadata?.renewal_date,
    contract.contract_metadata?.expiration_date
  ]
    .filter(Boolean)
    .map((value) => startOfDay(parseISO(value!)))
    .filter((value) => value >= today)
    .sort((left, right) => left.getTime() - right.getTime());

  return candidates[0]?.toISOString() ?? null;
}

function formatExposureValue(result: FinancialExposureResult) {
  if (result.warnings.some((warning) => warning.code === "multi_currency_without_conversion")) {
    return "Blocked";
  }

  if (result.amount === null || !result.currency) {
    return "No trusted amount";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: result.currency,
    maximumFractionDigits: 0
  }).format(result.amount);
}

function formatTrustLabel(level: IntelligenceTrustLevel) {
  switch (level) {
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

function compareExposureRows(
  left: FinancialExposureBreakdownRow,
  right: FinancialExposureBreakdownRow
) {
  const leftAmount = extractCurrencyAmount(left.valueLabel);
  const rightAmount = extractCurrencyAmount(right.valueLabel);

  if (leftAmount !== null && rightAmount !== null && leftAmount !== rightAmount) {
    return rightAmount - leftAmount;
  }

  if (left.includedContractCount !== right.includedContractCount) {
    return right.includedContractCount - left.includedContractCount;
  }

  return left.label.localeCompare(right.label);
}

function extractCurrencyAmount(label: string) {
  const normalized = label.replace(/[^0-9.-]/g, "");
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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

function deriveContractTrustStatus(contract: DashboardContractRow) {
  if (contract.contract_metadata?.needs_review) return "Needs Review";
  if (!contract.owner_user_id) return "Owner Missing";
  if ((contract.renewal_decision_status ?? "undecided") === "undecided") return "Decision Needed";

  const nextRelevantDate = getNextRelevantDate(contract);
  if (nextRelevantDate) {
    const daysUntilDue = differenceInCalendarDays(parseISO(nextRelevantDate), startOfDay(new Date()));
    if (daysUntilDue <= 30) {
      return "Due Soon";
    }
  }

  return "Verified";
}
