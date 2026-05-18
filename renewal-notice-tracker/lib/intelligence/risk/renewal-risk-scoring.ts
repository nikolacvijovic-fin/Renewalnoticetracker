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
import { calculateRiskScore } from "@/lib/intelligence/risk/risk-score";

export function buildAiRiskScoringInsights(
  snapshot: TrustedWorkflowStateSnapshot
): IntelligenceInsight<{
  riskBand: "low" | "medium" | "high" | "critical";
  scorePoints: number;
  confidenceLevel: "low" | "medium" | "high";
  reasons: string[];
  trustState: TrustedWorkflowStateSnapshot["trustState"];
}>[] {
  const warnings = buildIntelligenceWarnings(snapshot);
  const riskScore = calculateRiskScore({
    contractId: snapshot.contractId,
    contractTitle: snapshot.contractTitle,
    noticeDeadlineDate: snapshot.noticeDeadlineDate,
    renewalDate: snapshot.renewalDate,
    expirationDate: snapshot.expirationDate,
    autoRenewalConfirmed: snapshot.autoRenewal,
    contractValueAmount: snapshot.contractValue,
    ownerAssigned: snapshot.ownerAssigned,
    decisionStatus: snapshot.renewalDecisionStatus,
    reminderAcknowledged: snapshot.cycleStatus !== "awaiting_acknowledgment",
    weakEvidence: false,
    reviewCompleted: snapshot.reviewCompleted,
    acceptedRiskOverride: snapshot.trustState === "Unverified Risk Accepted",
    priceChangeTrigger: null,
    previousDeferWatchlist:
      snapshot.renewalDecisionStatus === "defer" || snapshot.cycleStatus === "parked",
    reminderDeliveryFailures: snapshot.reminderActivationState === "failed" ? 1 : 0,
    duplicateCounterpartyUncertainty: false
  });

  return [
    {
      layer: "risk",
      slug: "renewal_cycle_risk_score",
      title: "Renewal cycle risk score",
      summary:
        "Rules-first AI risk scoring interprets trusted workflow gaps without overriding review, owner, reminder, or decision gates.",
      trustLevel: deriveIntelligenceTrustLevel(snapshot),
      confidenceScore: deriveConfidenceScore(snapshot),
      dataQuality: deriveIntelligenceDataQuality(snapshot),
      sources: buildTrustedWorkflowSources(snapshot),
      calculationBasis: buildTrustedWorkflowBasis("risk.renewal_cycle_risk_score"),
      explanationMetadata: riskScore.explanation_metadata,
      warnings: [...warnings, ...riskScore.missing_data_warnings],
      output: {
        riskBand: riskScore.risk_band,
        scorePoints: riskScore.score_points,
        confidenceLevel: riskScore.confidence_level,
        reasons: riskScore.reasons.map((reason) => reason.label),
        trustState: snapshot.trustState
      }
    }
  ];
}
