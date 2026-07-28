import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import type { QuoteFindingInput, SavingsOpportunityInput } from "@/lib/quote-comparison/quote-types";

export function buildSavingsOpportunityFromFinding(input: {
  finding: QuoteFindingInput;
  currency?: string | null;
  priceDeltaAmount?: number | null;
}): SavingsOpportunityInput | null {
  if (!["price_increase", "discount_removed", "payment_terms_changed", "renewal_term_changed"].includes(input.finding.findingType)) {
    return null;
  }

  const estimatedSavingsAmount =
    input.finding.findingType === "price_increase" && (input.priceDeltaAmount ?? 0) > 0
      ? input.priceDeltaAmount ?? null
      : null;

  return {
    opportunityType: input.finding.findingType,
    title:
      input.finding.findingType === "price_increase"
        ? "Challenge renewal price increase"
        : input.finding.findingType === "discount_removed"
          ? "Reinstate removed discount"
          : input.finding.findingType === "payment_terms_changed"
            ? "Preserve current payment terms"
            : "Preserve current renewal term",
    estimatedSavingsAmount,
    currency: input.currency ?? null,
    confidence: Math.min(input.finding.confidence, 0.86),
    evidence: sanitizeQuoteEvidence({
      findingType: input.finding.findingType,
      severity: input.finding.severity,
      title: input.finding.title,
      deltaValue: input.finding.deltaValue,
      citation: input.finding.citation
    }) as Record<string, unknown>
  };
}
