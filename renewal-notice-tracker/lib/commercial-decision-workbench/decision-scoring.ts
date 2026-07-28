import type {
  CommercialDecisionBlockerCode,
  CommercialDecisionScore,
  CommercialDecisionScoreInput,
  CommercialDecisionWarningCode,
  CommercialRecommendedAction,
  CommercialRiskLevel,
  NegotiationPosture
} from "@/lib/commercial-decision-workbench/decision-types";

const RISK_SCORE: Record<CommercialRiskLevel, number> = {
  unknown: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5
};

function strongestRisk(values: CommercialRiskLevel[]) {
  return values.reduce<CommercialRiskLevel>(
    (current, next) => (RISK_SCORE[next] > RISK_SCORE[current] ? next : current),
    "unknown"
  );
}

function dateOnly(value: string | null | undefined) {
  if (!value) return null;
  return value.slice(0, 10);
}

function isPast(value: string | null, now: Date) {
  if (!value) return false;
  return new Date(`${value}T00:00:00.000Z`).getTime() < new Date(now.toISOString().slice(0, 10)).getTime();
}

function evidenceConfidenceLabel(value: number) {
  if (value >= 0.85) return "strong";
  if (value >= 0.7) return "medium";
  if (value > 0) return "weak";
  return "missing";
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function pickSavings(input: CommercialDecisionScoreInput) {
  const open = (input.savingsOpportunities ?? []).filter((opportunity) =>
    ["open", "in_review", "accepted"].includes(opportunity.status)
  );
  if (!open.length) return { amount: null, currency: input.quoteComparison?.currency ?? null };
  const best = open.reduce((current, next) =>
    (next.estimated_savings_amount ?? 0) > (current.estimated_savings_amount ?? 0) ? next : current
  );
  return {
    amount: best.estimated_savings_amount,
    currency: best.currency ?? input.quoteComparison?.currency ?? null
  };
}

function recommend(input: {
  risk: CommercialRiskLevel;
  blockers: CommercialDecisionBlockerCode[];
  warnings: CommercialDecisionWarningCode[];
  hasQuote: boolean;
  hasCriticalFinding: boolean;
  hasSavings: boolean;
  expiredNotice: boolean;
}): { action: CommercialRecommendedAction; posture: NegotiationPosture } {
  if (input.expiredNotice) return { action: "escalate", posture: "legal_review_required" };
  if (input.blockers.includes("missing_renewal_date") || input.blockers.includes("missing_owner")) {
    return { action: "needs_review", posture: "legal_review_required" };
  }
  if (!input.hasQuote) return { action: "needs_review", posture: "legal_review_required" };
  if (input.hasCriticalFinding) return { action: "renegotiate", posture: "challenge_increase" };
  if (input.hasSavings) return { action: "renegotiate", posture: "ask_for_discount" };
  if (input.risk === "high" || input.risk === "critical") return { action: "renegotiate", posture: "challenge_increase" };
  if (input.risk === "medium") return { action: "defer", posture: "request_term_change" };
  return { action: "renew", posture: "accept_quote" };
}

export function scoreCommercialDecision(input: CommercialDecisionScoreInput): CommercialDecisionScore {
  const metadata = input.contract.contract_metadata ?? null;
  const now = input.now instanceof Date ? input.now : input.now ? new Date(input.now) : new Date();
  const renewalDeadline = dateOnly(metadata?.renewal_date);
  const noticeDeadline = dateOnly(metadata?.notice_deadline_date);
  const blockers = new Set<CommercialDecisionBlockerCode>();
  const warnings = new Set<CommercialDecisionWarningCode>();

  if (!input.contract.owner_user_id) blockers.add("missing_owner");
  if (!renewalDeadline) blockers.add("missing_renewal_date");
  if (!input.quoteComparison || input.quoteComparison.status !== "completed") blockers.add("missing_quote_comparison");
  if (input.trustedReminderGate?.blocked) blockers.add("trusted_reminder_blocked");
  if (noticeDeadline && isPast(noticeDeadline, now)) blockers.add("expired_notice_deadline");
  if (!noticeDeadline) warnings.add("missing_notice_deadline");
  if (metadata?.has_weak_evidence || metadata?.needs_review) warnings.add("weak_contract_evidence");

  const criticalFinding = (input.quoteFindings ?? []).some((finding) => finding.severity === "critical");
  const highFinding = (input.quoteFindings ?? []).some((finding) => finding.severity === "high");
  if (criticalFinding) warnings.add("critical_quote_finding");
  const savings = pickSavings(input);
  if ((savings.amount ?? 0) > 0) warnings.add("high_savings_opportunity");
  if (input.quoteComparison && input.quoteComparison.status !== "reviewed") warnings.add("quote_not_reviewed");

  const confidenceParts = [
    ...(input.acceptedExtractedFields ?? []).map((field) => field.confidence),
    ...(input.quoteFindings ?? []).map((finding) => finding.confidence),
    ...(input.savingsOpportunities ?? []).map((opportunity) => opportunity.confidence)
  ];
  const evidenceConfidence = average(confidenceParts);
  const risk = strongestRisk([
    input.quoteComparison?.overall_risk_level ?? "unknown",
    criticalFinding ? "critical" : highFinding ? "high" : "unknown",
    blockers.has("expired_notice_deadline") ? "critical" : "unknown",
    metadata?.has_weak_evidence ? "medium" : "unknown"
  ]);
  const hasQuote = Boolean(input.quoteComparison && input.quoteComparison.status === "completed");
  const recommendation = recommend({
    risk,
    blockers: Array.from(blockers),
    warnings: Array.from(warnings),
    hasQuote,
    hasCriticalFinding: criticalFinding,
    hasSavings: (savings.amount ?? 0) > 0,
    expiredNotice: blockers.has("expired_notice_deadline")
  });
  const blockerCodes = Array.from(blockers);
  const readinessStatus =
    blockerCodes.length > 0
      ? blockerCodes.every((code) => code === "missing_quote_comparison")
        ? "evidence_pending"
        : "blocked"
      : "ready_for_review";

  return {
    commercialRiskLevel: risk,
    recommendedAction: recommendation.action,
    negotiationPosture: recommendation.posture,
    evidenceConfidence,
    evidenceConfidenceLabel: evidenceConfidenceLabel(evidenceConfidence),
    estimatedSavingsAmount: savings.amount,
    currency: savings.currency ?? metadata?.contract_value_currency ?? input.quoteComparison?.currency ?? null,
    renewalDeadline,
    noticeDeadline,
    blockerCodes,
    warningCodes: Array.from(warnings),
    readinessStatus,
    decisionStatus: readinessStatus === "ready_for_review" ? "ready_for_review" : "evidence_pending",
    decisionSummary:
      readinessStatus === "blocked"
        ? "Commercial decision is blocked until required owner, deadline, or reminder readiness evidence is resolved."
        : recommendation.action === "renegotiate"
          ? "Commercial evidence supports renegotiation before renewal approval."
          : recommendation.action === "escalate"
            ? "Commercial decision requires escalation because a critical deadline or risk is already active."
            : "Commercial evidence is ready for review.",
    commercialImpact: {
      quote_price_delta_percent: input.quoteComparison?.price_delta_percent ?? null,
      quote_price_delta_amount: input.quoteComparison?.price_delta_amount ?? null,
      quote_finding_count: input.quoteFindings?.length ?? 0,
      savings_opportunity_count: input.savingsOpportunities?.length ?? 0,
      renewal_cycle_status: input.contract.cycle_status ?? null,
      renewal_decision_status: input.contract.renewal_decision_status ?? null
    }
  };
}
