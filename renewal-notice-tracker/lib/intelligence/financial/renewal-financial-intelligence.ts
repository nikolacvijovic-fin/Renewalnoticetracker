import {
  buildIntelligenceWarnings,
  buildTrustedWorkflowBasis,
  buildTrustedWorkflowSources,
  deriveConfidenceScore,
  deriveIntelligenceDataQuality,
  deriveIntelligenceTrustLevel
} from "@/lib/intelligence/shared/trust";
import type {
  IntelligenceInsight,
  TrustedWorkflowStateSnapshot
} from "@/lib/intelligence/shared/types";

export function buildFinancialIntelligenceInsights(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceInsight<{
  forecastCategory: "unknown" | "renewal_value_at_risk" | "no_financial_signal";
  contractValue: number | null;
}>[] {
  const warnings = buildIntelligenceWarnings(snapshot);
  const forecastCategory =
    snapshot.contractValue && snapshot.contractValue > 0
      ? "renewal_value_at_risk"
      : "no_financial_signal";

  return [
    {
      layer: "financial",
      slug: "renewal_value_at_risk",
      title: "Renewal value at risk",
      summary:
        forecastCategory === "renewal_value_at_risk"
          ? "This contract has a declared value and can participate in future renewal-value analysis."
          : "No reliable contract value is available yet, so financial intelligence stays informational only.",
      trustLevel: deriveIntelligenceTrustLevel(snapshot),
      confidenceScore: deriveConfidenceScore(snapshot),
      dataQuality: deriveIntelligenceDataQuality(snapshot),
      sources: buildTrustedWorkflowSources(snapshot),
      calculationBasis: buildTrustedWorkflowBasis("financial.renewal_value_at_risk"),
      explanationMetadata: {
        calculation_version: "financial_intelligence.v1",
        input_data_version: "trusted_workflow_state.v1",
        trusted_fields_used: ["contract_value", "notice_deadline_date", "renewal_date", "expiration_date"],
        low_confidence_fields_used: snapshot.reviewCompleted ? [] : ["review_status"],
        excluded_fields: snapshot.contractValue == null ? ["contract_value"] : [],
        warnings
      },
      warnings,
      output: {
        forecastCategory,
        contractValue: snapshot.contractValue
      }
    }
  ];
}
