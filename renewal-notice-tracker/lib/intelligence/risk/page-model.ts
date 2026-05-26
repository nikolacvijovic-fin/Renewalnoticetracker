import type { RiskQueueView } from "@/lib/intelligence/risk/dashboard";

export type RiskQueueViewedAuditPayload = {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowConfidenceCount: number;
  riskBandsViewed: string[];
  calculationVersion: string;
  inputDataVersion: string;
  warningCount: number;
};

export function buildRiskQueueViewedAuditPayload(input: {
  organizationId: string;
  actorUserId: string;
  dashboard: RiskQueueView;
}): RiskQueueViewedAuditPayload {
  const { dashboard } = input;

  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractCount: dashboard.rows.length,
    lowConfidenceCount: dashboard.summary.lowConfidence,
    riskBandsViewed: Array.from(new Set(dashboard.rows.map((row) => row.riskBand))),
    warningCount: dashboard.rows.reduce(
      (sum, row) => sum + row.missingDataWarnings.length,
      0
    ),
    calculationVersion:
      dashboard.rows[0]?.explanationMetadata.calculation_version ?? "risk_score.v1",
    inputDataVersion:
      dashboard.rows[0]?.explanationMetadata.input_data_version ??
      "trusted_workflow_state.v1"
  };
}
