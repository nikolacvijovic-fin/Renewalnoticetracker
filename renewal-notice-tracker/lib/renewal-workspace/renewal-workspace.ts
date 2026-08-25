import { createHash } from "node:crypto";
import {
  RENEWAL_DECISION_TYPES,
  RENEWAL_WORKSPACE_STATUSES,
  type RenewalDecisionType,
  type RenewalTaskStatus,
  type RenewalWorkspaceStatus
} from "@/lib/renewal-workspace/types";

export type RenewalEvidenceReference = {
  evidenceType: "reviewed_contract_metadata" | "contract_citation" | "provider_usage_snapshot" | "reviewed_finding" | "uploaded_quote";
  evidenceId: string;
  label: string;
  reviewed: boolean;
  confidence: number;
};

export type ScenarioCalculationInput = {
  currentAnnualCost: number | null;
  currentCurrency: string | null;
  annualCost: number;
  currency: string;
  oneTimeTransitionCost?: number;
  commitmentYears?: number;
  exchangeRate?: number | null;
  exchangeRateSource?: string | null;
  evidence?: RenewalEvidenceReference[];
};

export type ApprovalPolicyInput = {
  decisionType: RenewalDecisionType;
  contractValue: number | null;
  proposedSavings: number | null;
  evidenceConfidence: number;
  terminationRisk: boolean;
  actorRole: string;
  actorUserId: string;
  decisionOwnerUserId: string | null;
};

const STATUS_TRANSITIONS: Record<RenewalWorkspaceStatus, RenewalWorkspaceStatus[]> = {
  draft: ["evidence_required", "ready_for_review", "archived"],
  evidence_required: ["draft", "ready_for_review", "archived"],
  ready_for_review: ["awaiting_approval", "draft", "archived"],
  awaiting_approval: ["approved", "rejected", "returned_for_changes"],
  approved: ["decision_recorded", "returned_for_changes"],
  rejected: ["returned_for_changes", "archived"],
  returned_for_changes: ["draft", "evidence_required", "ready_for_review", "archived"],
  decision_recorded: ["outcome_confirmed", "returned_for_changes"],
  outcome_confirmed: ["archived"],
  archived: []
};

const TASK_TRANSITIONS: Record<RenewalTaskStatus, RenewalTaskStatus[]> = {
  open: ["in_progress", "blocked", "completed", "cancelled"],
  in_progress: ["open", "blocked", "completed", "cancelled"],
  blocked: ["open", "in_progress", "cancelled"],
  completed: [],
  cancelled: []
};

function finiteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field}_must_be_finite_and_non_negative`);
  return value;
}

export function normalizeCurrency(value: string) {
  const currency = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency_must_be_three_uppercase_letters");
  return currency;
}

export function assertIsoDate(value: string, field = "date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${field}_must_be_iso_date`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${field}_must_be_iso_date`);
  }
  return value;
}

export function calculateRenewalScenario(input: ScenarioCalculationInput) {
  const annualCost = finiteNonNegative(input.annualCost, "annual_cost");
  const transitionCost = finiteNonNegative(input.oneTimeTransitionCost ?? 0, "transition_cost");
  const years = input.commitmentYears ?? 1;
  if (!Number.isInteger(years) || years < 1 || years > 10) throw new Error("commitment_years_out_of_range");
  const currency = normalizeCurrency(input.currency);
  let comparableCurrentCost = input.currentAnnualCost;
  let exchangeRateSource: string | null = null;

  if (comparableCurrentCost !== null) {
    finiteNonNegative(comparableCurrentCost, "current_annual_cost");
    const currentCurrency = input.currentCurrency ? normalizeCurrency(input.currentCurrency) : currency;
    if (currentCurrency !== currency) {
      const rate = input.exchangeRate;
      if (!rate || !Number.isFinite(rate) || rate <= 0 || !input.exchangeRateSource?.trim()) {
        throw new Error("explicit_exchange_rate_source_required");
      }
      comparableCurrentCost = comparableCurrentCost * rate;
      exchangeRateSource = input.exchangeRateSource.trim().slice(0, 200);
    }
  }

  const change = comparableCurrentCost === null ? null : annualCost - comparableCurrentCost;
  const estimatedSavings = change === null ? 0 : Math.max(0, -change);
  const netFirstYearEffect = estimatedSavings - transitionCost;
  const multiYearCommittedCost = annualCost * years + transitionCost;
  const evidence = input.evidence ?? [];
  const reviewedEvidence = evidence.filter((entry) => entry.reviewed && entry.confidence >= 0.7);

  return {
    currentAnnualCost: comparableCurrentCost === null ? null : Number(comparableCurrentCost.toFixed(2)),
    annualCost: Number(annualCost.toFixed(2)),
    changeFromCurrentCost: change === null ? null : Number(change.toFixed(2)),
    estimatedSavings: Number(estimatedSavings.toFixed(2)),
    oneTimeTransitionCost: Number(transitionCost.toFixed(2)),
    netFirstYearEffect: Number(netFirstYearEffect.toFixed(2)),
    commitmentYears: years,
    multiYearCommittedCost: Number(multiYearCommittedCost.toFixed(2)),
    currency,
    exchangeRateSource,
    evidenceCompleteness: evidence.length ? Number((reviewedEvidence.length / evidence.length).toFixed(2)) : 0
  };
}

export function assertRenewalWorkspaceTransition(from: RenewalWorkspaceStatus, to: RenewalWorkspaceStatus) {
  if (!RENEWAL_WORKSPACE_STATUSES.includes(from) || !RENEWAL_WORKSPACE_STATUSES.includes(to)) {
    throw new Error("unknown_renewal_workspace_status");
  }
  if (!STATUS_TRANSITIONS[from].includes(to)) throw new Error(`invalid_renewal_workspace_transition:${from}:${to}`);
  return { allowed: true as const, from, to };
}

export function assertRenewalTaskTransition(from: RenewalTaskStatus, to: RenewalTaskStatus) {
  if (!TASK_TRANSITIONS[from]?.includes(to)) throw new Error(`invalid_renewal_task_transition:${from}:${to}`);
  return { allowed: true as const, from, to };
}

export function evaluateRenewalApprovalPolicy(input: ApprovalPolicyInput) {
  const reasons: string[] = [];
  if ((input.contractValue ?? 0) >= 100_000) reasons.push("high_contract_value");
  if ((input.proposedSavings ?? 0) >= 25_000) reasons.push("material_savings_claim");
  if (["terminate", "replace_vendor", "consolidate_products"].includes(input.decisionType)) reasons.push("high_impact_decision");
  if (input.terminationRisk) reasons.push("termination_risk");
  if (input.evidenceConfidence < 0.8) reasons.push("evidence_confidence_below_policy");
  if (!['owner', 'admin', 'operator', 'reviewer'].includes(input.actorRole)) reasons.push("role_requires_review");
  const separationRequired = reasons.length > 0;
  return {
    approvalRequired: reasons.length > 0,
    separationRequired,
    canSelfApprove: !separationRequired || input.actorUserId !== input.decisionOwnerUserId,
    reasonCodes: reasons
  };
}

export function assertDecisionType(value: string): asserts value is RenewalDecisionType {
  if (!RENEWAL_DECISION_TYPES.includes(value as RenewalDecisionType)) throw new Error("invalid_renewal_decision_type");
}

export function validateEvidenceReferences(references: RenewalEvidenceReference[], requireReviewed = true) {
  if (!references.length) throw new Error("evidence_reference_required");
  for (const reference of references) {
    if (!reference.evidenceId.trim() || !reference.label.trim()) throw new Error("invalid_evidence_reference");
    if (!Number.isFinite(reference.confidence) || reference.confidence < 0 || reference.confidence > 1) {
      throw new Error("invalid_evidence_confidence");
    }
    if (requireReviewed && !reference.reviewed) throw new Error("unreviewed_evidence_cannot_support_decision");
  }
  return references;
}

export function materialDecisionFingerprint(input: {
  decisionType: RenewalDecisionType;
  rationale: string;
  preferredScenarioId: string | null;
  estimatedFinancialEffect: number | null;
  currency: string | null;
  decisionDeadline: string | null;
  evidenceIds: string[];
}) {
  return createHash("sha256").update(JSON.stringify({
    ...input,
    rationale: input.rationale.trim(),
    evidenceIds: [...input.evidenceIds].sort()
  })).digest("hex");
}

export function evaluateVerifiedWorkspaceCandidate(input: {
  contractId: string;
  isSample?: boolean;
  archived?: boolean;
  renewalDate?: string | null;
  noticeDeadlineDate?: string | null;
  needsReview?: boolean;
  hasWeakEvidence?: boolean;
  reviewedAt?: string | null;
}) {
  const reasonCodes: string[] = [];
  if (input.isSample) reasonCodes.push("sample_contract");
  if (input.archived) reasonCodes.push("archived_contract");
  if (!input.renewalDate && !input.noticeDeadlineDate) reasonCodes.push("verified_deadline_required");
  if (input.needsReview || input.hasWeakEvidence || !input.reviewedAt) reasonCodes.push("reviewed_metadata_required");
  return { eligible: reasonCodes.length === 0, contractId: input.contractId, reasonCodes };
}

export function sanitizeRenewalWorkspaceAuditMetadata(input: Record<string, unknown>) {
  const allowed = new Set([
    "organizationId", "contractId", "decisionId", "scenarioId", "taskId", "outcomeId", "actorUserId",
    "decisionType", "fromStatus", "toStatus", "decisionVersion", "currency", "amount", "reasonCodes",
    "evidenceCount", "evidenceCompleteness", "materialChange", "approvalRequired"
  ]);
  const forbidden = /(raw|text|body|clause|note|payload|secret|token|path|email|assertion|document|provider)/i;
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => {
    if (!allowed.has(key) || forbidden.test(key)) return false;
    if (typeof value === "string" && /(raw contract|provider payload|bearer |secret_|token_|storage\/)/i.test(value)) return false;
    return value === null || ["string", "number", "boolean"].includes(typeof value) || Array.isArray(value);
  }));
}
