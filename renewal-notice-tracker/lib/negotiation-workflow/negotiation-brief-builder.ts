import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import type { ContractExtractedField } from "@/lib/contract-intelligence/extraction-types";
import type {
  RenewalQuoteComparison,
  RenewalQuoteFinding,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";
import type {
  NegotiationBriefBuildResult,
  NegotiationStrategy
} from "@/lib/negotiation-workflow/negotiation-types";

function bounded(value: string, maxLength = 320) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function hasFinding(findings: RenewalQuoteFinding[], type: string) {
  return findings.some((finding) => finding.finding_type === type && finding.status !== "dismissed");
}

function hasCriticalQuoteIncrease(findings: RenewalQuoteFinding[], comparison: RenewalQuoteComparison | null) {
  return (
    hasFinding(findings, "price_increase") &&
    (findings.some((finding) => finding.finding_type === "price_increase" && finding.severity === "critical") ||
      (comparison?.price_delta_percent ?? 0) >= 15)
  );
}

function pickStrategy(input: {
  decision: CommercialDecision;
  comparison: RenewalQuoteComparison | null;
  findings: RenewalQuoteFinding[];
  savings: SavingsOpportunity[];
}): NegotiationStrategy {
  if (input.decision.blocker_codes.includes("expired_notice_deadline")) return "escalate_to_legal";
  if (input.decision.recommended_action === "cancel") return "cancel_or_nonrenew";
  if (input.decision.recommended_action === "defer") return "defer_decision";
  if (hasFinding(input.findings, "discount_removed")) return "preserve_existing_discount";
  if (hasCriticalQuoteIncrease(input.findings, input.comparison)) return "challenge_price_increase";
  if (input.savings.some((opportunity) => ["open", "in_review", "accepted"].includes(opportunity.status))) {
    return "request_discount";
  }
  if (hasFinding(input.findings, "renewal_term_changed")) return "request_term_change";
  if (hasFinding(input.findings, "usage_mismatch")) return "request_usage_rights_review";
  if (hasFinding(input.findings, "duplicate_vendor_risk")) return "consolidate_vendor";
  return "defer_decision";
}

function confidence(input: {
  decision: CommercialDecision;
  fields: ContractExtractedField[];
  findings: RenewalQuoteFinding[];
  savings: SavingsOpportunity[];
}) {
  const values = [
    input.decision.evidence_confidence,
    ...input.fields.map((field) => field.confidence),
    ...input.findings.map((finding) => finding.confidence),
    ...input.savings.map((opportunity) => opportunity.confidence)
  ].filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function buildNegotiationBrief(input: {
  decision: CommercialDecision;
  quoteComparison?: RenewalQuoteComparison | null;
  quoteFindings?: RenewalQuoteFinding[];
  savingsOpportunities?: SavingsOpportunity[];
  acceptedExtractedFields?: ContractExtractedField[];
}): NegotiationBriefBuildResult {
  const findings = input.quoteFindings ?? [];
  const savings = input.savingsOpportunities ?? [];
  const fields = input.acceptedExtractedFields ?? [];
  const strategy = pickStrategy({
    decision: input.decision,
    comparison: input.quoteComparison ?? null,
    findings,
    savings
  });
  const confidenceScore = confidence({ decision: input.decision, fields, findings, savings });
  const blockerCodes = [...input.decision.blocker_codes];
  const warningCodes = [...input.decision.warning_codes];
  const reviewFlags = new Set<string>();
  if (!input.quoteComparison || input.quoteComparison.status !== "completed") blockerCodes.push("missing_quote_comparison");
  if (confidenceScore < 0.7) reviewFlags.add("low_confidence_evidence");
  if (input.decision.commercial_risk_level === "critical") reviewFlags.add("critical_risk_review");
  if (strategy === "escalate_to_legal") reviewFlags.add("legal_review_required");
  if (strategy === "cancel_or_nonrenew") reviewFlags.add("procurement_or_owner_review_required");
  const questionsRequiringConfirmation: string[] = [];
  const evidenceLimitations: string[] = ["No external market benchmark is used."];
  if (!input.quoteComparison || input.quoteComparison.status !== "completed") {
    questionsRequiringConfirmation.push("Confirm the proposed renewal pricing and terms from a reviewed quote.");
    evidenceLimitations.push("No completed quote comparison is available.");
  }
  if (!input.decision.notice_deadline) {
    questionsRequiringConfirmation.push("Confirm the contractual notice deadline before external use.");
    evidenceLimitations.push("The notice deadline is not confirmed.");
  }
  if (!fields.length) evidenceLimitations.push("No accepted contract extraction fields are linked.");
  if (!savings.length) evidenceLimitations.push("No reviewed savings recommendation is linked.");
  if (strategy === "cancel_or_nonrenew") {
    questionsRequiringConfirmation.push("Confirm the notice method and non-renewal authority with the customer owner or counsel.");
  }

  const bestSavings = savings.reduce<SavingsOpportunity | null>(
    (best, next) => ((next.estimated_savings_amount ?? 0) > (best?.estimated_savings_amount ?? 0) ? next : best),
    null
  );
  const priceDeltaPercent = input.quoteComparison?.price_delta_percent ?? null;
  const savingsArgument = bestSavings?.estimated_savings_amount
    ? `Use documented savings opportunity of ${bestSavings.estimated_savings_amount} ${bestSavings.currency ?? input.decision.currency ?? ""}.`.trim()
    : priceDeltaPercent
      ? `Use the documented quote change of ${priceDeltaPercent}% as the negotiation anchor.`
      : null;

  const deadlineRisk = input.decision.notice_deadline
    ? `Notice deadline: ${input.decision.notice_deadline}.`
    : "No confirmed notice deadline is available; confirm timing before external communication.";

  return {
    status: blockerCodes.length > 0 ? "evidence_pending" : "ready_for_review",
    strategy,
    executiveSummary: bounded(
      `Commercial decision recommends ${input.decision.recommended_action.replaceAll("_", " ")} with ${input.decision.commercial_risk_level} risk.`
    ),
    targetAsk:
      strategy === "challenge_price_increase"
        ? "Challenge the price increase and request justification, rollback, or offsetting concessions."
        : strategy === "preserve_existing_discount"
          ? "Ask the vendor to preserve the existing discount or explain the commercial basis for removing it."
          : strategy === "request_discount"
            ? "Request a discount or commercial concession supported by savings evidence."
            : strategy === "escalate_to_legal"
              ? "Escalate deadline exposure and ask internal legal/procurement to confirm the safe position before vendor contact."
              : strategy === "cancel_or_nonrenew"
                ? "Prepare a non-renewal or cancellation position subject to internal approval."
                : "Defer commitment and request reviewed renewal terms before selecting a negotiation position.",
    fallbackPosition:
      strategy === "cancel_or_nonrenew"
        ? "Fallback: defer external notice until owner and legal/procurement confirm the non-renewal path."
        : "Fallback: request a short extension or hold current commercial terms while evidence is reviewed.",
    evidenceSummary: {
      decisionId: input.decision.id,
      quoteComparisonId: input.quoteComparison?.id ?? null,
      findingCount: findings.length,
      highOrCriticalFindingCount: findings.filter((finding) => ["high", "critical"].includes(finding.severity)).length,
      savingsOpportunityCount: savings.length,
      acceptedFieldKeys: fields.map((field) => field.field_key),
      recommendedAction: input.decision.recommended_action
    },
    commercialRiskSummary: bounded(
      `Risk is ${input.decision.commercial_risk_level}; recommendation is ${input.decision.recommended_action.replaceAll("_", " ")}.`
    ),
    savingsArgument,
    deadlineRisk,
    blockerCodes: Array.from(new Set(blockerCodes)),
    warningCodes,
    reviewFlags: Array.from(reviewFlags),
    confidenceScore,
    questionsRequiringConfirmation,
    evidenceLimitations
  };
}
