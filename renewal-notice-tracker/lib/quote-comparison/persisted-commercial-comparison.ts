import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  COMMERCIAL_CALCULATION_VERSION,
  COMMERCIAL_TAXONOMY_VERSION,
  buildCommercialEvidenceFingerprint,
  compareCommercialTerms,
  type CommercialTermsInput,
  type TrustedUsageEvidence
} from "@/lib/quote-comparison/commercial-comparison-engine";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import {
  getLatestAdminCommercialBaseline,
  persistAdminCommercialComparisonTransaction
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

  const result = compareCommercialTerms({
    contractId: input.contractId,
    baseline: baseline.terms_snapshot as CommercialTermsInput,
    proposal: input.proposalTerms,
    usageEvidence: input.usageEvidence,
    actionDeadline: input.actionDeadline
  });
  const proposalEvidenceIds = input.proposalTerms.lineItems
    .flatMap((line) => line.evidence.map((item) => item.evidenceId));
  const overallRiskLevel = result.findings.some((item) => item.severity === "critical")
    ? "critical"
    : result.findings.some((item) => item.severity === "high") ? "high" : "medium";
  const idempotencyKey = buildCommercialEvidenceFingerprint({
    baselineId: baseline.id,
    evidenceFingerprint: result.evidenceFingerprint,
    quoteFileId: input.quoteFileId ?? null,
    calculationVersion: COMMERCIAL_CALCULATION_VERSION
  });
  const payload = {
    comparison: {
      source: input.quoteFileId ? "file_upload" : "manual",
      status: result.status === "completed" ? "completed" : "failed",
      currentTotalAmount: result.costBridge.currentAnnualCost,
      proposedTotalAmount: result.costBridge.proposedAnnualCost,
      currency: result.costBridge.currency,
      priceDeltaAmount: result.costBridge.recurringDelta,
      overallRiskLevel,
      recommendationSummary: result.costBridge.explanation,
      warningCodes: result.warnings,
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      taxonomyVersion: COMMERCIAL_TAXONOMY_VERSION,
      costBridgeStatus: result.costBridge.status,
      evidenceFingerprint: result.evidenceFingerprint
    },
    proposal: {
      extractionRunId: input.extractionRunId ?? null,
      documentType: input.proposalDocumentType,
      termsSnapshot: sanitizeQuoteEvidence(input.proposalTerms),
      evidenceFieldIds: proposalEvidenceIds,
      evidenceFingerprint: result.evidenceFingerprint,
      warningCodes: result.warnings
    },
    proposalLines: result.proposal.map((line) => ({
      lineKey: line.lineKey,
      productName: line.productName,
      sku: line.sku ?? null,
      chargeType: line.chargeType,
      pricingModel: line.pricingModel,
      billingPeriod: line.billingPeriod,
      quantity: line.quantity ?? null,
      unitPrice: line.unitPrice ?? null,
      totalAmount: line.totalAmount ?? null,
      oneTimeAmount: line.oneTimeAmount,
      annualizedAmount: line.annualizedAmount,
      totalCommitmentAmount: line.totalCommitmentAmount,
      currency: line.currency,
      termMonths: line.termMonths ?? null,
      servicePeriodMonths: line.servicePeriodMonths ?? null,
      discountAmount: line.discountAmount ?? null,
      discountPercent: line.discountPercent ?? null,
      evidenceFieldIds: line.evidence.map((item) => item.evidenceId),
      citations: line.evidence.map(({ evidenceId, sourceFileId, extractionRunId, state, page, cell, label }) =>
        ({ evidenceId, sourceFileId, extractionRunId, state, page, cell, label })),
      warningCodes: line.warnings
    })),
    bridge: {
      ...result.costBridge,
      calculationVersion: COMMERCIAL_CALCULATION_VERSION,
      evidenceFingerprint: result.evidenceFingerprint
    },
    findings: result.findings,
    opportunities: result.opportunities,
    scenarios: result.scenarios.map((scenario) => ({
      ...scenario,
      calculationVersion: COMMERCIAL_CALCULATION_VERSION
    }))
  };

  try {
    const persisted = await persistAdminCommercialComparisonTransaction({
      organizationId: input.organizationId,
      contractId: input.contractId,
      actorUserId: input.actorUserId,
      baselineId: String(baseline.id),
      quoteFileId: input.quoteFileId,
      idempotencyKey,
      payload
    });
    if (persisted.error || !persisted.data) {
      throw persisted.error ?? new Error("Commercial comparison transaction returned no result.");
    }

    if (persisted.data.isNew) {
      await recordEnterpriseAuditEvent({
        organizationId: input.organizationId,
        contractId: input.contractId,
        actorUserId: input.actorUserId,
        eventType: "renewal_quote_comparison.completed",
        eventCategory: "evidence",
        eventSource: "renewal_quote_comparison",
        severity: "warning",
        metadata: {
          comparisonId: persisted.data.comparisonId,
          baselineId: baseline.id,
          proposalVersionId: persisted.data.proposalVersionId,
          findingCount: result.findings.length,
          opportunityCount: result.opportunities.length,
          costBridgeStatus: result.costBridge.status,
          evidenceFingerprint: result.evidenceFingerprint,
          calculationVersion: COMMERCIAL_CALCULATION_VERSION
        },
        mode: "best_effort"
      });
    }
    return {
      comparisonId: persisted.data.comparisonId,
      proposalVersionId: persisted.data.proposalVersionId,
      result
    };
  } catch (error) {
    await recordEnterpriseAuditEvent({
      organizationId: input.organizationId,
      contractId: input.contractId,
      actorUserId: input.actorUserId,
      eventType: "renewal_quote_comparison.failed",
      eventCategory: "evidence",
      eventSource: "renewal_quote_comparison",
      severity: "critical",
      metadata: {
        failureCode: "commercial_comparison_persistence_failed",
        idempotencyKey,
        calculationVersion: COMMERCIAL_CALCULATION_VERSION
      },
      mode: "best_effort"
    });
    throw error;
  }
}
