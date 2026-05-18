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

export function buildProcurementAnalyticsInsights(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceInsight<{
  workflowClass: "needs_vendor_identity_cleanup" | "ready_for_procurement_rollup";
  department: string | null;
}>[] {
  const warnings = buildIntelligenceWarnings(snapshot);
  const workflowClass = snapshot.counterpartyName.trim().length === 0
    ? "needs_vendor_identity_cleanup"
    : "ready_for_procurement_rollup";

  return [
    {
      layer: "procurement",
      slug: "vendor_rollup_readiness",
      title: "Vendor rollup readiness",
      summary:
        workflowClass === "ready_for_procurement_rollup"
          ? "Trusted vendor identity and workflow state can support future procurement rollups."
          : "Vendor identity cleanup is still needed before procurement-level analysis should be trusted.",
      trustLevel: deriveIntelligenceTrustLevel(snapshot),
      confidenceScore: deriveConfidenceScore(snapshot),
      dataQuality: deriveIntelligenceDataQuality(snapshot),
      sources: buildTrustedWorkflowSources(snapshot),
      calculationBasis: buildTrustedWorkflowBasis("procurement.vendor_rollup_readiness"),
      explanationMetadata: {
        calculation_version: "procurement_analytics.v1",
        input_data_version: "trusted_workflow_state.v1",
        trusted_fields_used: ["counterparty_name", "department", "owner_assigned"],
        low_confidence_fields_used: snapshot.reviewCompleted ? [] : ["review_status"],
        excluded_fields: snapshot.counterpartyName.trim().length === 0 ? ["counterparty_name"] : [],
        warnings
      },
      warnings,
      output: {
        workflowClass,
        department: snapshot.department
      }
    }
  ];
}
