import type { RenewalDecisionType } from "@/lib/renewal-workspace/types";
import type { EvidenceReadinessState } from "@/lib/evidence-readiness/types";

export type RenewalPortfolioItem = {
  decisionId: string | null;
  contractId: string;
  contractTitle: string;
  vendor: string;
  ownerUserId: string | null;
  department: string | null;
  noticeDeadline: string | null;
  renewalDeadline: string | null;
  daysRemaining: number | null;
  decisionType: RenewalDecisionType | null;
  approvalState: string;
  risk: string;
  currency: string | null;
  expectedSavings: number | null;
  confirmedSavings: number | null;
  outcomeConfirmedAt: string | null;
  evidenceScore: number | null;
  evidenceReadinessState: EvidenceReadinessState | null;
  criticalBlockerCount: number;
  nextEvidenceAction: string | null;
  missingEvidenceCategories: string[];
  portfolioStates: Array<"decision_not_started" | "deadline_needs_review" | "deadline_passed" | "evidence_blocked" | "approval_blocked" | "outcome_confirmed">;
};

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return firstRecord(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeRenewalPortfolioRows(rows: Array<Record<string, unknown>>, now = new Date()): RenewalPortfolioItem[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return rows.map((row) => {
    const contractLed = Boolean(row.organization_id && row.contract_metadata);
    const contract = contractLed ? row : firstRecord(row.contracts);
    const metadata = firstRecord(contract?.contract_metadata);
    const decisions = contractLed && Array.isArray(row.renewal_commercial_decisions)
      ? row.renewal_commercial_decisions as Array<Record<string, unknown>>
      : [];
    const decision = contractLed ? decisions.find((entry) => entry.decision_status !== "archived") ?? null : row;
    const outcome = contractLed ? firstRecord(row.renewal_decision_outcomes) : null;
    const metadataTrusted = Boolean(metadata?.reviewed_at && !metadata?.needs_review && !metadata?.has_weak_evidence);
    const noticeDeadline = optionalString(decision?.notice_deadline) ?? (metadataTrusted ? optionalString(metadata?.notice_deadline_date) : null);
    const deadlineTime = noticeDeadline ? new Date(`${noticeDeadline}T00:00:00.000Z`).valueOf() : Number.NaN;
    const daysRemaining = Number.isFinite(deadlineTime) ? Math.ceil((deadlineTime - today) / 86_400_000) : null;
    const decisionType = optionalString(decision?.decision_type) as RenewalDecisionType | null;
    const approvalState = optionalString(decision?.decision_status) ?? "decision_not_started";
    const portfolioStates: RenewalPortfolioItem["portfolioStates"] = [];
    if (!decision) portfolioStates.push("decision_not_started");
    if (!noticeDeadline) portfolioStates.push("deadline_needs_review");
    if (daysRemaining !== null && daysRemaining < 0) portfolioStates.push("deadline_passed");
    if (["evidence_pending", "evidence_required", "returned_for_changes"].includes(approvalState)) portfolioStates.push("approval_blocked");
    if (approvalState === "outcome_confirmed" || outcome) portfolioStates.push("outcome_confirmed");
    return {
      decisionId: decision ? String(decision.id) : null,
      contractId: String(contract?.id ?? row.contract_id),
      contractTitle: optionalString(metadata?.contract_title) ?? "Untitled contract",
      vendor: optionalString(metadata?.counterparty_name) ?? "Unknown vendor",
      ownerUserId: optionalString(contract?.owner_user_id),
      department: optionalString(contract?.department),
      noticeDeadline,
      renewalDeadline: optionalString(decision?.renewal_deadline) ?? optionalString(metadata?.renewal_date) ?? optionalString(metadata?.expiration_date),
      daysRemaining,
      decisionType,
      approvalState,
      risk: optionalString(decision?.commercial_risk_level) ?? "unknown",
      currency: optionalString(decision?.currency) ?? optionalString(metadata?.contract_value_currency) ?? optionalString(outcome?.currency),
      expectedSavings: optionalNumber(decision?.estimated_financial_effect ?? decision?.estimated_savings_amount),
      confirmedSavings: optionalNumber(outcome?.realized_savings ?? decision?.realized_savings_amount),
      outcomeConfirmedAt: optionalString(outcome?.renewal_completed_at ?? decision?.outcome_confirmed_at),
      evidenceScore: null,
      evidenceReadinessState: null,
      criticalBlockerCount: 0,
      nextEvidenceAction: null,
      missingEvidenceCategories: [],
      portfolioStates
    };
  });
}

function readinessProfile(decisionType: RenewalDecisionType | null) {
  switch (decisionType) {
    case "renew_unchanged": return "renew_unchanged";
    case "renew_reduced_seats": return "reduce_seats";
    case "renegotiate_price_or_terms": return "renegotiate";
    case "consolidate_products": return "consolidate";
    case "terminate": return "terminate";
    case "replace_vendor": return "replace_vendor";
    default: return "renewal_triage";
  }
}

export function attachEvidenceReadinessToPortfolio(
  items: RenewalPortfolioItem[],
  assessments: Array<Record<string, unknown>>
) {
  return items.map((item) => {
    const matching = assessments.find((assessment) =>
      assessment.contract_id === item.contractId && assessment.decision_profile === readinessProfile(item.decisionType)
    ) ?? assessments.find((assessment) => assessment.contract_id === item.contractId);
    if (!matching) return item;
    const evidenceItems = Array.isArray(matching.evidence_readiness_items)
      ? matching.evidence_readiness_items as Array<Record<string, unknown>>
      : [];
    const portfolioStates: RenewalPortfolioItem["portfolioStates"] = matching.readiness_state === "blocked" && !item.portfolioStates.includes("evidence_blocked")
      ? [...item.portfolioStates, "evidence_blocked"]
      : item.portfolioStates;
    return {
      ...item,
      evidenceScore: optionalNumber(matching.score),
      evidenceReadinessState: optionalString(matching.readiness_state) as EvidenceReadinessState | null,
      criticalBlockerCount: optionalNumber(matching.critical_blocker_count) ?? 0,
      nextEvidenceAction: optionalString(matching.next_recommended_action),
      missingEvidenceCategories: [...new Set(evidenceItems
        .filter((entry) => ["missing", "stale", "conflicting", "insufficient"].includes(String(entry.state)))
        .map((entry) => String(entry.category)))],
      portfolioStates
    };
  }).sort((left, right) =>
    Number(right.portfolioStates.includes("deadline_passed")) - Number(left.portfolioStates.includes("deadline_passed"))
    || (left.daysRemaining ?? Number.POSITIVE_INFINITY) - (right.daysRemaining ?? Number.POSITIVE_INFINITY)
    || right.criticalBlockerCount - left.criticalBlockerCount
    || Number(right.portfolioStates.includes("decision_not_started")) - Number(left.portfolioStates.includes("decision_not_started"))
    || Number(right.portfolioStates.includes("approval_blocked")) - Number(left.portfolioStates.includes("approval_blocked"))
    || (left.evidenceScore ?? -1) - (right.evidenceScore ?? -1)
  );
}

export function filterRenewalPortfolio(items: RenewalPortfolioItem[], filters: {
  owner?: string | null;
  vendor?: string | null;
  decisionType?: string | null;
  approvalState?: string | null;
  risk?: string | null;
  currency?: string | null;
  department?: string | null;
  readinessState?: string | null;
  missingEvidenceCategory?: string | null;
  portfolioState?: string | null;
}) {
  const vendor = filters.vendor?.trim().toLowerCase();
  return items.filter((item) =>
    (!filters.owner || item.ownerUserId === filters.owner) &&
    (!vendor || item.vendor.toLowerCase().includes(vendor)) &&
    (!filters.decisionType || item.decisionType === filters.decisionType) &&
    (!filters.approvalState || item.approvalState === filters.approvalState) &&
    (!filters.risk || item.risk === filters.risk) &&
    (!filters.currency || item.currency === filters.currency.toUpperCase()) &&
    (!filters.department || item.department === filters.department) &&
    (!filters.readinessState || item.evidenceReadinessState === filters.readinessState) &&
    (!filters.missingEvidenceCategory || item.missingEvidenceCategories.includes(filters.missingEvidenceCategory)) &&
    (!filters.portfolioState || item.portfolioStates.includes(filters.portfolioState as RenewalPortfolioItem["portfolioStates"][number]))
  );
}
