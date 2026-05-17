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
      warnings,
      output: {
        forecastCategory,
        contractValue: snapshot.contractValue
      }
    }
  ];
}
