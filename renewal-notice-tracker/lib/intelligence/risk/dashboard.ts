import { differenceInCalendarDays, parseISO, startOfDay } from "date-fns";
import type { CounterpartyRecord } from "@/lib/contracts/kernel-queries";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";
import { getPhase1TrustState } from "@/lib/contracts/phase1-pilot";
import { calculateRiskScore, type RiskScoreResult } from "@/lib/intelligence/risk/risk-score";
import type { RiskBand, RiskConfidenceLevel, RiskMissingDataWarning, RiskReason } from "@/lib/intelligence/risk/risk-factors";

export const RISK_QUEUE_BANDS = ["all", "critical", "high", "medium", "low"] as const;
export const RISK_QUEUE_DUE_WINDOWS = [7, 14, 30, 60, 90] as const;
export const RISK_QUEUE_TRUST_FILTERS = ["all", "verified", "low_confidence"] as const;

export type RiskQueueBandFilter = (typeof RISK_QUEUE_BANDS)[number];
export type RiskQueueTrustFilter = (typeof RISK_QUEUE_TRUST_FILTERS)[number];

export type RiskActionLink = {
  label: "Review P0" | "Assign owner" | "Record decision" | "Acknowledge" | "Open contract";
  href: string;
};

export type RiskExplanationModel = {
  contractId: string;
  contractTitle: string;
  counterpartyName: string;
  department: string;
  ownerLabel: string;
  workflowTrustState: string;
  riskBand: RiskBand;
  confidenceLevel: RiskConfidenceLevel;
  reasons: RiskReason[];
  missingDataWarnings: RiskMissingDataWarning[];
  lastCalculatedAt: string;
  dueLabel: string;
  dueDate: string | null;
  nextActionLabel: "Review P0" | "Assign owner" | "Record decision" | "Acknowledge" | "Open contract";
  guidance: string;
  actionLinks: RiskActionLink[];
};

export type RiskQueueRow = RiskExplanationModel & {
  scorePoints: number;
};

export type RiskQueueView = {
  rows: RiskQueueRow[];
  filterOptions: {
    owners: Array<{ user_id: string; label: string }>;
    departments: string[];
    riskBands: readonly RiskQueueBandFilter[];
    dueWindows: readonly number[];
    trustStatuses: readonly RiskQueueTrustFilter[];
  };
  filters: {
    ownerUserId: string;
    department: string;
    riskBand: RiskQueueBandFilter;
    dueWindowDays: string;
    trustStatus: RiskQueueTrustFilter;
  };
  summary: {
    total: number;
    critical: number;
    high: number;
    lowConfidence: number;
  };
  emptyState: {
    title: string;
    description: string;
    actionLabel: string;
    actionHref: string;
  } | null;
};

type RiskWorkflowSubject = {
  contractId: string;
  contractTitle: string;
  counterpartyName: string;
  department: string;
  ownerLabel: string;
  workflowTrustState: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  autoRenewalConfirmed: boolean | null;
  contractValueAmount: number | null;
  decisionStatus:
    | "undecided"
    | "renew"
    | "terminate"
    | "renegotiate"
    | "defer"
    | "no_action_required";
  reminderAcknowledged: boolean;
  weakEvidence: boolean;
  reviewCompleted: boolean;
  acceptedRiskOverride: boolean;
  priceChangeTrigger: string | null;
  previousDeferWatchlist: boolean;
  reminderDeliveryFailures: number;
  duplicateCounterpartyUncertainty: boolean;
};

export function normalizeRiskBandFilter(value: string | null | undefined): RiskQueueBandFilter {
  if ((RISK_QUEUE_BANDS as readonly string[]).includes(value ?? "")) {
    return value as RiskQueueBandFilter;
  }

  return "all";
}

export function normalizeRiskDueWindow(value: string | null | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return RISK_QUEUE_DUE_WINDOWS.includes(parsed as (typeof RISK_QUEUE_DUE_WINDOWS)[number])
    ? parsed
    : null;
}

export function normalizeRiskTrustFilter(value: string | null | undefined): RiskQueueTrustFilter {
  if ((RISK_QUEUE_TRUST_FILTERS as readonly string[]).includes(value ?? "")) {
    return value as RiskQueueTrustFilter;
  }

  return "all";
}

export function buildRiskQueueView(input: {
  contracts: DashboardContractRow[];
  duplicateCounterpartyIds?: string[];
  filterOptions: {
    owners: Array<{ user_id: string; label: string }>;
    departments: string[];
  };
  filters: {
    ownerUserId?: string;
    department?: string;
    riskBand?: string;
    dueWindowDays?: string | null;
    trustStatus?: string;
  };
}) {
  const duplicateCounterpartyIds = new Set(input.duplicateCounterpartyIds ?? []);
  const rows = input.contracts
    .map((contract) =>
      buildRiskQueueRow(
        createRiskWorkflowSubjectFromDashboardContract(
          contract,
          duplicateCounterpartyIds.has(contract.counterparty_id ?? "")
        )
      )
    )
    .filter((row) => applyRiskQueueFilters(row, input.filters))
    .sort(compareRiskRows);

  const totalContracts = input.contracts.length;
  const emptyState =
    totalContracts === 0
      ? {
          title: "Import contracts first",
          description:
            "The risk queue appears after you upload or import contracts into the review workflow.",
          actionLabel: "Upload contract",
          actionHref: "/dashboard/contracts/new"
        }
      : rows.length === 0
        ? {
            title: "No contracts match this queue",
            description:
              "Try widening the risk band, due window, or trust filters to see the next contracts that need attention.",
            actionLabel: "Open all contracts",
            actionHref: "/dashboard/contracts"
          }
        : null;

  return {
    rows,
    filterOptions: {
      owners: input.filterOptions.owners,
      departments: input.filterOptions.departments,
      riskBands: RISK_QUEUE_BANDS,
      dueWindows: RISK_QUEUE_DUE_WINDOWS,
      trustStatuses: RISK_QUEUE_TRUST_FILTERS
    },
    filters: {
      ownerUserId: input.filters.ownerUserId ?? "",
      department: input.filters.department ?? "",
      riskBand: normalizeRiskBandFilter(input.filters.riskBand),
      dueWindowDays: input.filters.dueWindowDays ?? "",
      trustStatus: normalizeRiskTrustFilter(input.filters.trustStatus)
    },
    summary: {
      total: rows.length,
      critical: rows.filter((row) => row.riskBand === "critical").length,
      high: rows.filter((row) => row.riskBand === "high").length,
      lowConfidence: rows.filter((row) => row.confidenceLevel === "low").length
    },
    emptyState
  } satisfies RiskQueueView;
}

export function createRiskWorkflowSubjectFromDashboardContract(
  contract: DashboardContractRow,
  duplicateCounterpartyUncertainty = false
): RiskWorkflowSubject {
  const metadata = contract.contract_metadata;
  const ownerLabel = contract.owner_name?.trim() || "Unassigned";
  const workflowTrustState = getPhase1TrustState({
    owner_user_id: contract.owner_user_id ?? null,
    renewal_decision_status: contract.renewal_decision_status ?? "undecided",
    cycle_status: contract.cycle_status ?? "open",
    contract_metadata: {
      needs_review: metadata?.needs_review,
      notice_deadline_date: metadata?.notice_deadline_date ?? null,
      renewal_date: metadata?.renewal_date ?? null,
      expiration_date: metadata?.expiration_date ?? null,
      auto_renewal: metadata?.auto_renewal ?? null
    }
  });

  return {
    contractId: contract.id ?? "",
    contractTitle: metadata?.contract_title ?? "Untitled contract",
    counterpartyName: metadata?.counterparty_name ?? "Counterparty not set",
    department: contract.department?.trim() || "Unassigned department",
    ownerLabel,
    workflowTrustState,
    noticeDeadlineDate: metadata?.notice_deadline_date ?? null,
    renewalDate: metadata?.renewal_date ?? null,
    expirationDate: metadata?.expiration_date ?? null,
    autoRenewalConfirmed: metadata?.auto_renewal ?? null,
    contractValueAmount: metadata?.contract_value_amount ?? null,
    decisionStatus: normalizeDecisionStatus(contract.renewal_decision_status),
    reminderAcknowledged: (contract.cycle_status ?? "open") !== "awaiting_acknowledgment",
    weakEvidence: Boolean(metadata?.has_weak_evidence),
    reviewCompleted: !metadata?.needs_review,
    acceptedRiskOverride: Boolean(metadata?.accepted_unverified_risk_requested),
    priceChangeTrigger: metadata?.price_change_trigger ?? null,
    previousDeferWatchlist: normalizeDecisionStatus(contract.renewal_decision_status) === "defer",
    reminderDeliveryFailures: 0,
    duplicateCounterpartyUncertainty
  };
}

export function buildRiskQueueRow(subject: RiskWorkflowSubject): RiskQueueRow {
  const result = calculateRiskScore({
    contractId: subject.contractId,
    contractTitle: subject.contractTitle,
    noticeDeadlineDate: subject.noticeDeadlineDate,
    renewalDate: subject.renewalDate,
    expirationDate: subject.expirationDate,
    autoRenewalConfirmed: subject.autoRenewalConfirmed,
    contractValueAmount: subject.contractValueAmount,
    ownerAssigned: subject.ownerLabel !== "Unassigned",
    decisionStatus: subject.decisionStatus,
    reminderAcknowledged: subject.reminderAcknowledged,
    weakEvidence: subject.weakEvidence,
    reviewCompleted: subject.reviewCompleted,
    acceptedRiskOverride: subject.acceptedRiskOverride,
    priceChangeTrigger: subject.priceChangeTrigger,
    previousDeferWatchlist: subject.previousDeferWatchlist,
    reminderDeliveryFailures: subject.reminderDeliveryFailures,
    duplicateCounterpartyUncertainty: subject.duplicateCounterpartyUncertainty
  });

  const { label: dueLabel, date: dueDate } = selectDueDate(subject);
  const actionLinks = buildRiskActionLinks(subject.contractId, subject);
  const nextActionLabel = actionLinks[0]?.label ?? "Open contract";

  return {
    contractId: subject.contractId,
    contractTitle: subject.contractTitle,
    counterpartyName: subject.counterpartyName,
    department: subject.department,
    ownerLabel: subject.ownerLabel,
    workflowTrustState: subject.workflowTrustState,
    riskBand: result.risk_band,
    confidenceLevel: result.confidence_level,
    reasons: result.reasons,
    missingDataWarnings: result.missing_data_warnings,
    lastCalculatedAt: result.last_calculated_at,
    dueLabel,
    dueDate,
    nextActionLabel,
    guidance: buildRiskGuidance(nextActionLabel),
    actionLinks,
    scorePoints: result.score_points
  };
}

export function getRiskBandLabel(riskBand: RiskBand) {
  switch (riskBand) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

export function getRiskConfidenceLabel(confidenceLevel: RiskConfidenceLevel) {
  switch (confidenceLevel) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    default:
      return "Low confidence";
  }
}

export function getRiskTrustFilterLabel(value: RiskQueueTrustFilter) {
  switch (value) {
    case "verified":
      return "Verified only";
    case "low_confidence":
      return "Low confidence only";
    default:
      return "All trust states";
  }
}

function applyRiskQueueFilters(
  row: RiskQueueRow,
  filters: {
    ownerUserId?: string;
    department?: string;
    riskBand?: string;
    dueWindowDays?: string | null;
    trustStatus?: string;
  }
) {
  if (filters.ownerUserId && row.ownerLabel === "Unassigned") {
    return false;
  }

  if (filters.department && row.department !== filters.department) {
    return false;
  }

  const bandFilter = normalizeRiskBandFilter(filters.riskBand);
  if (bandFilter !== "all" && row.riskBand !== bandFilter) {
    return false;
  }

  const trustFilter = normalizeRiskTrustFilter(filters.trustStatus);
  if (trustFilter === "verified" && row.workflowTrustState !== "Verified") {
    return false;
  }
  if (trustFilter === "low_confidence" && row.workflowTrustState === "Verified") {
    return false;
  }

  const dueWindow = normalizeRiskDueWindow(filters.dueWindowDays);
  if (dueWindow != null) {
    if (!row.dueDate) return false;
    const daysUntil = differenceInCalendarDays(parseISO(row.dueDate), startOfDay(new Date()));
    if (daysUntil > dueWindow) {
      return false;
    }
  }

  return true;
}

function buildRiskActionLinks(contractId: string, subject: RiskWorkflowSubject): RiskActionLink[] {
  const baseHref = `/dashboard/contracts/${contractId}`;
  const actions: RiskActionLink[] = [];

  if (!subject.reviewCompleted) {
    actions.push({ label: "Review P0", href: `${baseHref}#review-panel` });
  }

  if (subject.ownerLabel === "Unassigned") {
    actions.push({ label: "Assign owner", href: `${baseHref}#review-panel` });
  }

  if (subject.decisionStatus === "undecided") {
    actions.push({ label: "Record decision", href: `${baseHref}#decision-panel` });
  }

  if (!subject.reminderAcknowledged) {
    actions.push({ label: "Acknowledge", href: `${baseHref}#acknowledgment-panel` });
  }

  actions.push({ label: "Open contract", href: baseHref });

  return Array.from(new Map(actions.map((action) => [action.label, action])).values());
}

function buildRiskGuidance(action: RiskActionLink["label"]) {
  switch (action) {
    case "Review P0":
      return "Review the P0 record before trusted workflow can move forward.";
    case "Assign owner":
      return "Assign one accountable owner so the workflow has a clear operator path.";
    case "Record decision":
      return "Record the renewal decision inside the current cycle.";
    case "Acknowledge":
      return "Acknowledge the reminder so the cycle can keep moving.";
    default:
      return "Escalate the contract inside the weekly workflow if it still needs attention.";
  }
}

function selectDueDate(subject: RiskWorkflowSubject) {
  const today = startOfDay(new Date());
  const candidates = [
    { label: "Notice deadline", date: subject.noticeDeadlineDate },
    { label: "Renewal date", date: subject.renewalDate },
    { label: "Expiration date", date: subject.expirationDate }
  ]
    .filter((candidate) => Boolean(candidate.date))
    .map((candidate) => ({
      ...candidate,
      daysUntil: differenceInCalendarDays(parseISO(candidate.date!), today)
    }))
    .sort((left, right) => {
      const leftOverdue = left.daysUntil < 0;
      const rightOverdue = right.daysUntil < 0;
      if (leftOverdue && rightOverdue) return right.daysUntil - left.daysUntil;
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      return left.daysUntil - right.daysUntil;
    });

  return {
    label: candidates[0]?.label ?? "No trusted due date",
    date: candidates[0]?.date ?? null
  };
}

function compareRiskRows(left: RiskQueueRow, right: RiskQueueRow) {
  const bandOrder = { critical: 4, high: 3, medium: 2, low: 1 } satisfies Record<RiskBand, number>;
  if (bandOrder[left.riskBand] !== bandOrder[right.riskBand]) {
    return bandOrder[right.riskBand] - bandOrder[left.riskBand];
  }

  if (left.scorePoints !== right.scorePoints) {
    return right.scorePoints - left.scorePoints;
  }

  if (left.dueDate && right.dueDate) {
    return left.dueDate.localeCompare(right.dueDate);
  }

  if (left.dueDate || right.dueDate) {
    return left.dueDate ? -1 : 1;
  }

  return left.contractTitle.localeCompare(right.contractTitle);
}

function normalizeDecisionStatus(
  value: string | null | undefined
): RiskWorkflowSubject["decisionStatus"] {
  switch (value) {
    case "renew":
    case "terminate":
    case "renegotiate":
    case "defer":
    case "no_action_required":
      return value;
    default:
      return "undecided";
  }
}
