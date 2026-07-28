import {
  computePriceDelta,
  normalizeQuoteTerms,
  sanitizeQuoteCitation,
  sanitizeQuoteEvidence
} from "@/lib/quote-comparison/quote-normalization";
import type {
  NormalizedQuoteTerms,
  QuoteComparisonResult,
  QuoteFindingInput,
  QuoteRiskLevel
} from "@/lib/quote-comparison/quote-types";
import { buildSavingsOpportunityFromFinding } from "@/lib/quote-comparison/savings-opportunities";

const SEVERITY_SCORE: Record<QuoteRiskLevel, number> = {
  unknown: 0,
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5
};

function strongestRisk(findings: QuoteFindingInput[]): QuoteRiskLevel {
  return findings.reduce<QuoteRiskLevel>(
    (riskLevel, finding) =>
      SEVERITY_SCORE[finding.severity] > SEVERITY_SCORE[riskLevel] ? finding.severity : riskLevel,
    "unknown"
  );
}

export function classifyQuoteRisk(input: {
  priceDeltaPercent?: number | null;
  findingCount?: number;
  hasRemovedDiscount?: boolean;
  hasTermChange?: boolean;
}): QuoteRiskLevel {
  const percent = input.priceDeltaPercent ?? 0;
  if (percent >= 25 || (percent >= 15 && input.hasRemovedDiscount)) return "critical";
  if (percent >= 15 || input.hasRemovedDiscount) return "high";
  if (percent >= 8 || input.hasTermChange) return "medium";
  if (percent > 0 || (input.findingCount ?? 0) > 0) return "low";
  return "info";
}

function textSet(values: string[]) {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function arrayRemoved(current: string[], proposed: string[]) {
  const proposedSet = textSet(proposed);
  return current.filter((value) => !proposedSet.has(value.trim().toLowerCase()));
}

function arrayChanged(current: string[], proposed: string[]) {
  const currentSet = textSet(current);
  const proposedSet = textSet(proposed);
  return (
    current.length !== proposed.length ||
    current.some((value) => !proposedSet.has(value.trim().toLowerCase())) ||
    proposed.some((value) => !currentSet.has(value.trim().toLowerCase()))
  );
}

function finding(input: QuoteFindingInput): QuoteFindingInput {
  return {
    ...input,
    currentValue: sanitizeQuoteEvidence(input.currentValue),
    proposedValue: sanitizeQuoteEvidence(input.proposedValue),
    deltaValue: sanitizeQuoteEvidence(input.deltaValue),
    citation: sanitizeQuoteCitation(input.citation)
  };
}

export function compareRenewalQuoteToContract(input: {
  currentTerms: Record<string, unknown>;
  proposedTerms: Record<string, unknown>;
  citationSnippet?: string | null;
}): QuoteComparisonResult {
  const current = normalizeQuoteTerms(input.currentTerms);
  const proposed = normalizeQuoteTerms(input.proposedTerms);
  const { priceDeltaAmount, priceDeltaPercent } = computePriceDelta(
    current.totalAmount,
    proposed.totalAmount
  );
  const findings: QuoteFindingInput[] = [];
  const citation = input.citationSnippet
    ? { snippet: input.citationSnippet, evidenceLabel: "renewal quote" }
    : null;

  if ((priceDeltaAmount ?? 0) > 0) {
    const risk = classifyQuoteRisk({ priceDeltaPercent });
    findings.push(
      finding({
        findingType: "price_increase",
        severity: risk === "critical" ? "critical" : risk === "high" ? "high" : "medium",
        title: "Renewal quote increases total cost",
        description: "The proposed renewal total is higher than the current contract baseline and should be reviewed before approval.",
        currentValue: { amount: current.totalAmount, currency: current.currency },
        proposedValue: { amount: proposed.totalAmount, currency: proposed.currency ?? current.currency },
        deltaValue: { amount: priceDeltaAmount, percent: priceDeltaPercent },
        confidence: current.totalAmount && proposed.totalAmount ? 0.9 : 0.65,
        citation
      })
    );
  }

  const removedDiscounts = arrayRemoved(current.discounts, proposed.discounts);
  if (removedDiscounts.length > 0) {
    findings.push(
      finding({
        findingType: "discount_removed",
        severity: "high",
        title: "Discount appears removed",
        description: "A discount present in the current baseline is missing from the renewal quote evidence.",
        currentValue: { discounts: current.discounts },
        proposedValue: { discounts: proposed.discounts },
        deltaValue: { removedDiscounts },
        confidence: 0.8,
        citation
      })
    );
  }

  if (arrayChanged(current.skuList, proposed.skuList)) {
    findings.push(
      finding({
        findingType: "sku_changed",
        severity: "medium",
        title: "SKU list changed",
        description: "The proposed renewal appears to change included SKUs or line items.",
        currentValue: { skus: current.skuList },
        proposedValue: { skus: proposed.skuList },
        confidence: 0.72,
        citation
      })
    );
  }

  if (current.paymentTerms && proposed.paymentTerms && current.paymentTerms !== proposed.paymentTerms) {
    findings.push(
      finding({
        findingType: "payment_terms_changed",
        severity: "medium",
        title: "Payment terms changed",
        description: "The quote changes payment terms from the current contract baseline.",
        currentValue: current.paymentTerms,
        proposedValue: proposed.paymentTerms,
        confidence: 0.82,
        citation
      })
    );
  }

  if (current.renewalTerm && proposed.renewalTerm && current.renewalTerm !== proposed.renewalTerm) {
    findings.push(
      finding({
        findingType: "renewal_term_changed",
        severity: "medium",
        title: "Renewal term changed",
        description: "The quote changes the renewal term and should be reviewed before acceptance.",
        currentValue: current.renewalTerm,
        proposedValue: proposed.renewalTerm,
        confidence: 0.82,
        citation
      })
    );
  }

  if (proposed.autoRenewal === true && !proposed.noticeDeadlineDate) {
    findings.push(
      finding({
        findingType: "notice_window_risk",
        severity: "high",
        title: "Auto-renewal notice window is missing",
        description: "The quote indicates auto-renewal but does not include a safe opt-out or notice deadline.",
        proposedValue: { autoRenewal: true, noticeDeadlineDate: null },
        confidence: 0.76,
        citation
      })
    );
  }

  const overallRiskLevel = strongestRisk(findings);
  const warnings = [
    ...(current.totalAmount === null ? ["current_amount_missing"] : []),
    ...(proposed.totalAmount === null ? ["proposed_amount_missing"] : []),
    ...(findings.length === 0 ? ["deterministic_scaffold_no_risky_change_detected"] : [])
  ];

  return {
    currentTotalAmount: current.totalAmount,
    proposedTotalAmount: proposed.totalAmount,
    currency: proposed.currency ?? current.currency,
    priceDeltaAmount,
    priceDeltaPercent,
    overallRiskLevel,
    findings,
    savingsOpportunities: findings
      .map((entry) =>
        buildSavingsOpportunityFromFinding({
          finding: entry,
          currency: proposed.currency ?? current.currency,
          priceDeltaAmount
        })
      )
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
    recommendationSummary:
      findings.length > 0
        ? "Review quote findings before approving renewal or accepting new commercial terms."
        : "No deterministic renewal quote risk detected. Keep human review before relying on this evidence.",
    warnings
  };
}

export function summarizeNormalizedQuoteTerms(terms: NormalizedQuoteTerms) {
  return {
    totalAmount: terms.totalAmount,
    currency: terms.currency,
    discountCount: terms.discounts.length,
    skuCount: terms.skuList.length,
    hasPaymentTerms: Boolean(terms.paymentTerms),
    hasRenewalTerm: Boolean(terms.renewalTerm),
    autoRenewal: terms.autoRenewal
  };
}
