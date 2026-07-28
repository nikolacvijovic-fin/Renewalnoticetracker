import { compareQuote, type CompareQuoteResponse } from "@/lib/add-ons/python-intelligence-client";
import {
  createRenewalQuoteComparison,
  failRenewalQuoteComparison,
  recordQuoteComparisonFindings
} from "@/lib/quote-comparison/quote-comparison";
import type { QuoteComparisonResult } from "@/lib/quote-comparison/quote-types";

export type RunPythonQuoteComparisonInput = {
  organizationId: string;
  contractId: string;
  quoteFileId?: string | null;
  requestedByUserId?: string | null;
  currentTerms: Record<string, unknown>;
  proposedTerms: Record<string, unknown>;
  quoteText?: string | null;
};

function normalizePythonResult(output: CompareQuoteResponse): QuoteComparisonResult {
  return {
    currentTotalAmount: output.current_total_amount,
    proposedTotalAmount: output.proposed_total_amount,
    currency: output.currency,
    priceDeltaAmount: output.price_delta_amount,
    priceDeltaPercent: output.price_delta_percent,
    overallRiskLevel: output.overall_risk_level,
    findings: output.findings.map((finding) => ({
      findingType: finding.finding_type,
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      currentValue: finding.current_value,
      proposedValue: finding.proposed_value,
      deltaValue: finding.delta_value,
      confidence: finding.confidence,
      citation: finding.citation
        ? {
            sourceFileId: finding.citation.source_file_id ?? null,
            page: finding.citation.page ?? null,
            snippet: finding.citation.snippet ?? null,
            evidenceLabel: finding.citation.evidence_label ?? null
          }
        : null
    })),
    savingsOpportunities: output.savings_opportunities.map((opportunity) => ({
      opportunityType: opportunity.opportunity_type,
      title: opportunity.title,
      estimatedSavingsAmount: opportunity.estimated_savings_amount,
      currency: opportunity.currency,
      confidence: opportunity.confidence,
      evidence: opportunity.evidence
    })),
    recommendationSummary: output.recommendation_summary,
    warnings: output.warnings
  };
}

export async function runPythonRenewalQuoteComparison(input: RunPythonQuoteComparisonInput) {
  const comparison = await createRenewalQuoteComparison({
    organizationId: input.organizationId,
    contractId: input.contractId,
    quoteFileId: input.quoteFileId ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    source: input.quoteFileId ? "file_upload" : "manual"
  });

  const response = await compareQuote({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    current_terms: input.currentTerms,
    proposed_terms: input.proposedTerms,
    quote_text: input.quoteText ?? undefined,
    comparison_mode: "deterministic_scaffold"
  });

  if (!response.ok) {
    await failRenewalQuoteComparison({
      organizationId: input.organizationId,
      contractId: input.contractId,
      comparisonId: comparison.id,
      actorUserId: input.requestedByUserId ?? null,
      safeErrorMessage: response.safeMessage,
      warningCodes: [response.errorCode]
    });
    return {
      ok: false as const,
      comparisonId: comparison.id,
      errorCode: response.errorCode,
      safeMessage: response.safeMessage
    };
  }

  const result = await recordQuoteComparisonFindings({
    organizationId: input.organizationId,
    contractId: input.contractId,
    comparisonId: comparison.id,
    actorUserId: input.requestedByUserId ?? null,
    result: normalizePythonResult(response.output)
  });

  return {
    ok: true as const,
    comparison: result.comparison,
    findings: result.findings
  };
}
