import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  COMMERCIAL_CALCULATION_VERSION,
  COMMERCIAL_TAXONOMY_VERSION,
  compareCommercialTerms,
  type CommercialTermsInput,
  type TrustedUsageEvidence
} from "@/lib/quote-comparison/commercial-comparison-engine";
import {
  createRenewalQuoteComparison,
  failRenewalQuoteComparison
} from "@/lib/quote-comparison/quote-comparison";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import {
  getLatestAdminCommercialBaseline,
  insertAdminCommercialCostBridge,
  insertAdminCommercialScenarios,
  insertAdminProposalLineItems,
  insertAdminProposalVersion,
  insertAdminRenewalQuoteFindings,
  insertAdminSavingsOpportunity,
  updateAdminRenewalQuoteComparison
} from "@/lib/quote-comparison/repositories/admin-quote-comparison-repository";

export async function runPersistedCommercialComparison(input: {
  organizationId: string;
  contractId: string;
  actorUserId: string;
  proposalTerms: CommercialTermsInput;
  proposalDocumentType: "renewal_quote" | "amendment" | "replacement_order_form" | "pricing_proposal" | "unknown_commercial_document";
  quoteFileId?: string | null;
  extractionRunId?: string | null;
  usageEvidence?: TrustedUsageEvidence[];
  actionDeadline?: string | null;
}) {
  const baselineResult = await getLatestAdminCommercialBaseline({
    organizationId: input.organizationId,
    contractId: input.contractId
  });
  if (baselineResult.error) throw baselineResult.error;
  if (!baselineResult.data) throw new Error("Create a reviewed commercial baseline before comparing a proposal.");
  const baseline = baselineResult.data;
  const comparison = await createRenewalQuoteComparison({
    organizationId: input.organizationId,
    contractId: input.contractId,
    quoteFileId: input.quoteFileId ?? null,
    requestedByUserId: input.actorUserId,
    source: input.quoteFileId ? "file_upload" : "manual"
  });

  try {
    const result = compareCommercialTerms({
      contractId: input.contractId,
      baseline: baseline.terms_snapshot as CommercialTermsInput,
      proposal: input.proposalTerms,
      usageEvidence: input.usageEvidence,
      actionDeadline: input.actionDeadline
    });
    const proposalEvidenceIds = input.proposalTerms.lineItems.flatMap((line) => line.evidence.map((item) => item.evidenceId));
    const proposal = await insertAdminProposalVersion({
      organizationId: input.organizationId,
      contractId: input.contractId,
      comparisonId: comparison.id,
      quoteFileId: input.quoteFileId,
      extractionRunId: input.extractionRunId,
      documentType: input.proposalDocumentType,
      termsSnapshot: sanitizeQuoteEvidence(input.proposalTerms) as Record<string, unknown>,
      evidenceFieldIds: proposalEvidenceIds,
      evidenceFingerprint: result.evidenceFingerprint,
      warningCodes: result.warnings
    });
    if (proposal.error || !proposal.data) throw proposal.error ?? new Error("Proposal version was not created.");
    const proposalVersionId = String(proposal.data.id);
    const lines = await insertAdminProposalLineItems({
      organizationId: input.organizationId,
      contractId: input.contractId,
      proposalVersionId,
      rows: result.proposal.map((line) => ({
        line_key: line.lineKey, product_name: line.productName, sku: line.sku ?? null,
        charge_type: line.chargeType, pricing_model: line.pricingModel, billing_period: line.billingPeriod,
        quantity: line.quantity ?? null, unit_price: line.unitPrice ?? null, total_amount: line.totalAmount ?? null,
        annualized_amount: line.annualizedAmount, total_commitment_amount: line.totalCommitmentAmount,
        currency: line.currency, term_months: line.termMonths ?? null,
        service_period_months: line.servicePeriodMonths ?? null, discount_amount: line.discountAmount ?? null,
        discount_percent: line.discountPercent ?? null, evidence_field_ids: line.evidence.map((item) => item.evidenceId),
        citations: line.evidence.map(({ evidenceId, sourceFileId, extractionRunId, state, page, cell, label }) => ({ evidenceId, sourceFileId, extractionRunId, state, page, cell, label })),
        warning_codes: line.warnings
      }))
    });
    if (lines.error) throw lines.error;
    const bridge = await insertAdminCommercialCostBridge({
      organizationId: input.organizationId,
      contractId: input.contractId,
      comparisonId: comparison.id,
      baselineId: String(baseline.id),
      proposalVersionId,
      values: {
        status: result.costBridge.status, currency: result.costBridge.currency,
        current_annual_cost: result.costBridge.currentAnnualCost, proposed_annual_cost: result.costBridge.proposedAnnualCost,
        attributed_delta: result.costBridge.attributedDelta, residual_amount: result.costBridge.residualAmount,
        components: result.costBridge.components, explanation: result.costBridge.explanation,
        limitation_codes: result.costBridge.limitations, calculation_version: COMMERCIAL_CALCULATION_VERSION,
        evidence_fingerprint: result.evidenceFingerprint
      }
    });
    if (bridge.error) throw bridge.error;
    const findings = await insertAdminRenewalQuoteFindings({
      organizationId: input.organizationId,
      contractId: input.contractId,
      comparisonId: comparison.id,
      findings: result.findings.map((item) => ({
        finding_type: item.findingType, reason_code: item.reasonCode, severity: item.severity,
        title: item.title, description: item.description, current_value: item.currentValue,
        proposed_value: item.proposedValue, delta_value: { amount: item.absoluteDelta, percent: item.percentageDelta },
        absolute_delta: item.absoluteDelta, percentage_delta: item.percentageDelta,
        annualized_impact: item.annualizedImpact, total_commitment_impact: item.totalCommitmentImpact,
        confidence: item.confidence, current_evidence_field_ids: item.currentEvidenceIds,
        proposed_evidence_field_ids: item.proposedEvidenceIds, limitation_codes: item.limitations,
        calculation_version: item.calculationVersion, taxonomy_version: item.taxonomyVersion, status: "open"
      }))
    });
    if (findings.error) throw findings.error;
    for (const opportunity of result.opportunities) {
      const inserted = await insertAdminSavingsOpportunity({
        organizationId: input.organizationId,
        contractId: input.contractId,
        comparisonId: comparison.id,
        opportunity: {
          opportunity_type: opportunity.type, title: opportunity.recommendedAction,
          estimated_savings_amount: opportunity.highSavingsAmount,
          estimated_savings_low: opportunity.lowSavingsAmount, estimated_savings_high: opportunity.highSavingsAmount,
          currency: opportunity.currency, confidence: opportunity.evidenceCompleteness === "complete" ? 0.9 : 0.5,
          evidence_completeness: opportunity.evidenceCompleteness, rationale: opportunity.rationale,
          assumptions: opportunity.assumptions, missing_evidence: opportunity.missingEvidence,
          action_deadline: opportunity.actionDeadline, estimate_status: "estimated",
          evidence: { supportingFindingReasonCodes: opportunity.supportingFindingReasonCodes }
        }
      });
      if (inserted.error) throw inserted.error;
    }
    const scenarios = await insertAdminCommercialScenarios({
      organizationId: input.organizationId,
      contractId: input.contractId,
      comparisonId: comparison.id,
      rows: result.scenarios.map((scenario) => ({
        scenario_type: scenario.type, status: scenario.status, annual_cost: scenario.annualCost,
        first_year_effect: scenario.firstYearEffect, multi_year_commitment: scenario.multiYearCommitment,
        transition_cost: scenario.transitionCost, estimated_savings_low: scenario.estimatedSavingsLow,
        estimated_savings_high: scenario.estimatedSavingsHigh, major_risks: scenario.majorRisks,
        evidence_fingerprint: scenario.evidenceFingerprint, calculation_version: COMMERCIAL_CALCULATION_VERSION
      }))
    });
    if (scenarios.error) throw scenarios.error;
    const updated = await updateAdminRenewalQuoteComparison({
      organizationId: input.organizationId,
      comparisonId: comparison.id,
      values: {
        status: result.status === "completed" ? "completed" : "failed",
        baseline_id: baseline.id, proposal_version_id: proposalVersionId,
        current_total_amount: result.costBridge.currentAnnualCost,
        proposed_total_amount: result.costBridge.proposedAnnualCost,
        currency: result.costBridge.currency,
        price_delta_amount: result.costBridge.currentAnnualCost != null && result.costBridge.proposedAnnualCost != null
          ? result.costBridge.proposedAnnualCost - result.costBridge.currentAnnualCost : null,
        overall_risk_level: result.findings.some((item) => item.severity === "critical") ? "critical"
          : result.findings.some((item) => item.severity === "high") ? "high" : "medium",
        recommendation_summary: result.costBridge.explanation,
        warning_codes: result.warnings,
        calculation_version: COMMERCIAL_CALCULATION_VERSION,
        taxonomy_version: COMMERCIAL_TAXONOMY_VERSION,
        cost_bridge_status: result.costBridge.status,
        evidence_fingerprint: result.evidenceFingerprint
      }
    });
    if (updated.error) throw updated.error;
    await recordEnterpriseAuditEvent({
      organizationId: input.organizationId, contractId: input.contractId, actorUserId: input.actorUserId,
      eventType: "renewal_quote_comparison.completed", eventCategory: "evidence",
      eventSource: "renewal_quote_comparison", severity: "warning",
      metadata: sanitizeQuoteEvidence({ comparisonId: comparison.id, baselineId: baseline.id,
        proposalVersionId, findingCount: result.findings.length, opportunityCount: result.opportunities.length,
        costBridgeStatus: result.costBridge.status, evidenceFingerprint: result.evidenceFingerprint,
        calculationVersion: COMMERCIAL_CALCULATION_VERSION }) as Record<string, unknown>, mode: "best_effort"
    });
    return { comparisonId: comparison.id, proposalVersionId, result };
  } catch (error) {
    await failRenewalQuoteComparison({ organizationId: input.organizationId, contractId: input.contractId,
      comparisonId: comparison.id, actorUserId: input.actorUserId,
      safeErrorMessage: "Commercial comparison could not be completed with the reviewed evidence.",
      warningCodes: ["commercial_comparison_persistence_failed"] });
    throw error;
  }
}
