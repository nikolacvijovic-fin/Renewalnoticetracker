import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { RenewalCommandContractInput } from "@/lib/dashboard/renewal-command-center";

export type UrgentRenewalTrustStatus = "trusted" | "needs_review" | "missing_notice_deadline";

export type UrgentRenewalItemReason =
  | "missed_notice_deadline"
  | "notice_deadline_due_today"
  | "notice_deadline_due_7_days"
  | "notice_deadline_due_30_days"
  | "high_spend_at_risk"
  | "missing_owner"
  | "missing_or_weak_notice_deadline"
  | "needs_metadata_review";

export type UrgentRenewalItem = {
  contractId: string;
  contractTitle: string;
  counterpartyName: string;
  noticeDeadlineDate: string | null;
  renewalDate: string | null;
  expirationDate: string | null;
  daysLeft: number | null;
  contractValueAmount: number | null;
  contractValueCurrency: string | null;
  ownerName: string | null;
  ownerUserId: string | null;
  trustStatus: UrgentRenewalTrustStatus;
  primaryReason: UrgentRenewalItemReason;
  reasonCodes: UrgentRenewalItemReason[];
  primaryActionHref: string;
  sortRank: number;
};

export type UrgentRenewalSummary = {
  urgentThisWeek: number;
  dueThisMonth: number;
  missedDeadlines: number;
  missingNoticeDeadlines: number;
  needsReview: number;
  unassignedOwners: number;
  spendAtRiskAmount: number;
  spendAtRiskCurrency: string;
};

export type UrgentRenewalEmptyState =
  | "no_contracts"
  | "all_missing_metadata"
  | "extraction_needs_review"
  | "no_urgent_deadlines"
  | "all_clear"
  | null;

export type UrgentRenewalDashboard = {
  generatedAt: string;
  topUrgentItems: UrgentRenewalItem[];
  allActionItems: UrgentRenewalItem[];
  summary: UrgentRenewalSummary;
  emptyState: UrgentRenewalEmptyState;
};

const HIGH_SPEND_THRESHOLD = 25000;
const ACTIVE_CONTRACT_STATUSES = new Set(["active", "needs_review", "extraction_failed"]);
const INACTIVE_MARKERS = new Set(["archived", "resolved", "cancelled", "canceled", "deleted", "ignored"]);

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysUntil(date: string | null | undefined, now: Date) {
  const parsed = parseDateOnly(date);
  if (!parsed) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
  return Math.round((target - startOfToday) / (24 * 60 * 60 * 1000));
}

function isActiveContract(contract: RenewalCommandContractInput) {
  const status = String(contract.status ?? "active").toLowerCase();
  const statusTag = String(contract.statusTag ?? "").toLowerCase();
  const cycleStatus = String(contract.cycleStatus ?? "").toLowerCase();

  if (!ACTIVE_CONTRACT_STATUSES.has(status) && INACTIVE_MARKERS.has(status)) return false;
  return !INACTIVE_MARKERS.has(statusTag) && !INACTIVE_MARKERS.has(cycleStatus);
}

function hasTrustedNoticeDeadline(contract: RenewalCommandContractInput) {
  if (!contract.noticeDeadlineDate) return false;
  return (contract.fieldConfidence?.notice_deadline_date ?? 0) >= LOW_CONFIDENCE_THRESHOLD;
}

function trustStatusFor(contract: RenewalCommandContractInput): UrgentRenewalTrustStatus {
  if (!contract.noticeDeadlineDate) return "missing_notice_deadline";
  return hasTrustedNoticeDeadline(contract) ? "trusted" : "needs_review";
}

function reasonRank(reason: UrgentRenewalItemReason) {
  const ranks: Record<UrgentRenewalItemReason, number> = {
    missed_notice_deadline: 1,
    notice_deadline_due_today: 2,
    notice_deadline_due_7_days: 3,
    notice_deadline_due_30_days: 4,
    high_spend_at_risk: 5,
    missing_owner: 6,
    missing_or_weak_notice_deadline: 7,
    needs_metadata_review: 8
  };
  return ranks[reason];
}

function actionReasons(contract: RenewalCommandContractInput, trustedDaysLeft: number | null) {
  const reasons: UrgentRenewalItemReason[] = [];
  const value = Math.max(0, Number(contract.contractValueAmount ?? 0));
  const trustedDeadline = hasTrustedNoticeDeadline(contract);

  if (trustedDeadline && trustedDaysLeft !== null && trustedDaysLeft < 0) {
    reasons.push("missed_notice_deadline");
  } else if (trustedDeadline && trustedDaysLeft === 0) {
    reasons.push("notice_deadline_due_today");
  } else if (trustedDeadline && trustedDaysLeft !== null && trustedDaysLeft > 0 && trustedDaysLeft <= 7) {
    reasons.push("notice_deadline_due_7_days");
  } else if (trustedDeadline && trustedDaysLeft !== null && trustedDaysLeft > 7 && trustedDaysLeft <= 30) {
    reasons.push("notice_deadline_due_30_days");
  }

  if (value >= HIGH_SPEND_THRESHOLD) reasons.push("high_spend_at_risk");
  if (!contract.ownerUserId) reasons.push("missing_owner");
  if (!trustedDeadline) reasons.push("missing_or_weak_notice_deadline");
  if (contract.needsReview || contract.hasWeakEvidence) reasons.push("needs_metadata_review");

  return reasons;
}

function buildItem(contract: RenewalCommandContractInput, now: Date): UrgentRenewalItem | null {
  if (!isActiveContract(contract)) return null;

  const trustedDaysLeft = hasTrustedNoticeDeadline(contract)
    ? daysUntil(contract.noticeDeadlineDate, now)
    : null;
  const reasons = actionReasons(contract, trustedDaysLeft);
  if (reasons.length === 0) return null;

  const primaryReason = [...reasons].sort((left, right) => reasonRank(left) - reasonRank(right))[0]!;

  return {
    contractId: contract.id,
    contractTitle: contract.title,
    counterpartyName: contract.counterpartyName ?? "Unknown vendor",
    noticeDeadlineDate: contract.noticeDeadlineDate ?? null,
    renewalDate: contract.renewalDate ?? null,
    expirationDate: contract.expirationDate ?? null,
    daysLeft: trustedDaysLeft,
    contractValueAmount: contract.contractValueAmount ?? null,
    contractValueCurrency: contract.contractValueCurrency ?? null,
    ownerName: contract.ownerUserId ? contract.ownerName ?? "Unknown owner" : null,
    ownerUserId: contract.ownerUserId ?? null,
    trustStatus: trustStatusFor(contract),
    primaryReason,
    reasonCodes: reasons,
    primaryActionHref: `/dashboard/contracts/${contract.id}`,
    sortRank: reasonRank(primaryReason)
  };
}

function compareUrgentItems(left: UrgentRenewalItem, right: UrgentRenewalItem) {
  return (
    left.sortRank - right.sortRank ||
    (left.daysLeft ?? 9999) - (right.daysLeft ?? 9999) ||
    Math.max(0, right.contractValueAmount ?? 0) - Math.max(0, left.contractValueAmount ?? 0) ||
    left.contractTitle.localeCompare(right.contractTitle) ||
    left.contractId.localeCompare(right.contractId)
  );
}

function summarize(items: UrgentRenewalItem[]): UrgentRenewalSummary {
  const spendCurrency =
    items.find((item) => item.contractValueCurrency)?.contractValueCurrency ?? "USD";
  const spendAtRiskAmount = items.reduce((total, item) => total + Math.max(0, item.contractValueAmount ?? 0), 0);

  return {
    urgentThisWeek: items.filter((item) => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 7).length,
    dueThisMonth: items.filter((item) => item.daysLeft !== null && item.daysLeft >= 0 && item.daysLeft <= 30).length,
    missedDeadlines: items.filter((item) => item.reasonCodes.includes("missed_notice_deadline")).length,
    missingNoticeDeadlines: items.filter((item) => item.trustStatus === "missing_notice_deadline").length,
    needsReview: items.filter((item) => item.reasonCodes.includes("needs_metadata_review")).length,
    unassignedOwners: items.filter((item) => !item.ownerUserId).length,
    spendAtRiskAmount,
    spendAtRiskCurrency: spendCurrency
  };
}

function emptyStateFor(contracts: RenewalCommandContractInput[], items: UrgentRenewalItem[]): UrgentRenewalEmptyState {
  const activeContracts = contracts.filter(isActiveContract);
  if (activeContracts.length === 0) return "no_contracts";
  if (items.length === 0) return "all_clear";
  if (activeContracts.every((contract) => !contract.noticeDeadlineDate && !contract.renewalDate && !contract.expirationDate)) {
    return "all_missing_metadata";
  }
  if (items.every((item) => item.trustStatus !== "trusted")) return "extraction_needs_review";
  if (items.every((item) => item.daysLeft === null || item.daysLeft > 30)) return "no_urgent_deadlines";
  return null;
}

export function buildUrgentRenewalDashboard(input: {
  contracts: RenewalCommandContractInput[];
  now?: Date;
  topLimit?: number;
}): UrgentRenewalDashboard {
  const now = input.now ?? new Date();
  const allActionItems = input.contracts
    .map((contract) => buildItem(contract, now))
    .filter((item): item is UrgentRenewalItem => Boolean(item))
    .sort(compareUrgentItems);

  return {
    generatedAt: now.toISOString(),
    topUrgentItems: allActionItems.slice(0, input.topLimit ?? 5),
    allActionItems,
    summary: summarize(allActionItems),
    emptyState: emptyStateFor(input.contracts, allActionItems)
  };
}
