import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  sanitizeQuoteEvidence
} from "@/lib/quote-comparison/quote-normalization";
import { buildSavingsOpportunityFromFinding } from "@/lib/quote-comparison/savings-opportunities";
import type {
  QuoteComparisonResult,
  QuoteFindingInput,
  QuoteFindingStatus,
  RenewalQuoteComparison,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";
import {
  getAdminRenewalQuoteComparison,
  getAdminRenewalQuoteFinding,
  insertAdminRenewalQuoteComparison,
  insertAdminRenewalQuoteFindings,
  insertAdminSavingsOpportunity,
  listAdminRenewalQuoteComparisons,
  listAdminRenewalQuoteFindings,
  listAdminSavingsOpportunities,
  updateAdminRenewalQuoteComparison,
  updateAdminRenewalQuoteFinding,
  updateAdminSavingsOpportunity
} from "@/lib/quote-comparison/repositories/admin-quote-comparison-repository";

function safeAuditMetadata(input: Record<string, unknown>) {
  return sanitizeQuoteEvidence(input) as Record<string, unknown>;
}

function normalizeFindingForInsert(finding: QuoteFindingInput) {
  return {
    finding_type: finding.findingType,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    current_value: sanitizeQuoteEvidence(finding.currentValue) ?? null,
    proposed_value: sanitizeQuoteEvidence(finding.proposedValue) ?? null,
    delta_value: sanitizeQuoteEvidence(finding.deltaValue) ?? null,
    confidence: finding.confidence,
    citation: sanitizeQuoteEvidence(finding.citation) ?? null,
    status: "open"
  };
}

export async function createRenewalQuoteComparison(input: {
  organizationId: string;
  contractId: string;
  quoteFileId?: string | null;
  requestedByUserId?: string | null;
  source?: "manual" | "file_upload" | "python_intelligence";
}) {
  const result = await insertAdminRenewalQuoteComparison(input);
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal quote comparison was not created.");

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.requestedByUserId ?? null,
    eventType: "renewal_quote_comparison.created",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: "info",
    metadata: safeAuditMetadata({
      comparisonId: result.data.id,
      quoteFileId: input.quoteFileId ?? null,
      source: result.data.source
    }),
    mode: "best_effort"
  });

  return result.data;
}

export async function getRenewalQuoteComparison(input: {
  organizationId: string;
  comparisonId: string;
}): Promise<RenewalQuoteComparison> {
  const result = await getAdminRenewalQuoteComparison(input);
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal quote comparison not found for active organization.");
  return result.data;
}

export async function listQuoteComparisons(input: {
  organizationId: string;
  contractId: string;
  limit?: number;
}) {
  const result = await listAdminRenewalQuoteComparisons(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function recordQuoteComparisonFindings(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  actorUserId?: string | null;
  result: QuoteComparisonResult;
}) {
  const findings = await insertAdminRenewalQuoteFindings({
    organizationId: input.organizationId,
    contractId: input.contractId,
    comparisonId: input.comparisonId,
    findings: input.result.findings.map(normalizeFindingForInsert)
  });
  if (findings.error) throw findings.error;

  const completed = await updateAdminRenewalQuoteComparison({
    organizationId: input.organizationId,
    comparisonId: input.comparisonId,
    values: {
      status: "completed",
      current_total_amount: input.result.currentTotalAmount,
      proposed_total_amount: input.result.proposedTotalAmount,
      currency: input.result.currency,
      price_delta_amount: input.result.priceDeltaAmount,
      price_delta_percent: input.result.priceDeltaPercent,
      overall_risk_level: input.result.overallRiskLevel,
      recommendation_summary: input.result.recommendationSummary,
      warning_codes: input.result.warnings,
      safe_error_message: null
    }
  });
  if (completed.error) throw completed.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "renewal_quote_comparison.completed",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: input.result.overallRiskLevel === "critical" ? "critical" : "warning",
    metadata: safeAuditMetadata({
      comparisonId: input.comparisonId,
      findingIds: (findings.data ?? []).map((finding) => finding.id),
      riskLevel: input.result.overallRiskLevel,
      priceDeltaPercent: input.result.priceDeltaPercent,
      warningCodes: input.result.warnings
    }),
    mode: "best_effort"
  });

  return {
    comparison: completed.data,
    findings: findings.data ?? []
  };
}

export async function failRenewalQuoteComparison(input: {
  organizationId: string;
  contractId: string;
  comparisonId: string;
  actorUserId?: string | null;
  safeErrorMessage: string;
  warningCodes?: string[];
}) {
  const failed = await updateAdminRenewalQuoteComparison({
    organizationId: input.organizationId,
    comparisonId: input.comparisonId,
    values: {
      status: "failed",
      safe_error_message:
        (sanitizeQuoteEvidence(input.safeErrorMessage) as string | undefined) ??
        "Renewal quote comparison failed.",
      warning_codes: input.warningCodes ?? ["quote_comparison_failed"]
    }
  });
  if (failed.error) throw failed.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "renewal_quote_comparison.failed",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: "critical",
    metadata: safeAuditMetadata({
      comparisonId: input.comparisonId,
      failureCode: "ERR_RENEWAL_QUOTE_COMPARISON_FAILED_001",
      warningCodes: input.warningCodes ?? []
    }),
    mode: "best_effort"
  });

  return failed.data;
}

export async function listQuoteFindings(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  const result = await listAdminRenewalQuoteFindings(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function reviewQuoteFinding(input: {
  organizationId: string;
  findingId: string;
  reviewerUserId: string;
  decision: Extract<QuoteFindingStatus, "reviewed" | "dismissed" | "accepted">;
}) {
  const reviewedAt = new Date().toISOString();
  const result = await updateAdminRenewalQuoteFinding({
    organizationId: input.organizationId,
    findingId: input.findingId,
    values: {
      status: input.decision,
      reviewed_by_user_id: input.reviewerUserId,
      reviewed_at: reviewedAt
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Renewal quote finding was not found.");

  await recordEnterpriseAuditEvent({
    organizationId: result.data.organization_id,
    contractId: result.data.contract_id,
    actorUserId: input.reviewerUserId,
    eventType: "renewal_quote_finding.reviewed",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: result.data.severity === "critical" ? "critical" : "warning",
    metadata: safeAuditMetadata({
      findingId: result.data.id,
      comparisonId: result.data.comparison_id,
      findingType: result.data.finding_type,
      decision: input.decision,
      confidence: result.data.confidence
    }),
    mode: "best_effort"
  });

  return result.data;
}

export async function createSavingsOpportunityFromFinding(input: {
  organizationId: string;
  findingId: string;
  actorUserId?: string | null;
  ownerUserId?: string | null;
}) {
  const finding = await getAdminRenewalQuoteFinding({
    organizationId: input.organizationId,
    findingId: input.findingId
  });
  if (finding.error) throw finding.error;
  if (!finding.data) throw new Error("Renewal quote finding was not found.");

  const opportunity = buildSavingsOpportunityFromFinding({
    finding: {
      findingType: finding.data.finding_type,
      severity: finding.data.severity,
      title: finding.data.title,
      description: finding.data.description,
      currentValue: finding.data.current_value,
      proposedValue: finding.data.proposed_value,
      deltaValue: finding.data.delta_value,
      confidence: finding.data.confidence,
      citation: finding.data.citation as never
    },
    currency: null,
    priceDeltaAmount:
      typeof (finding.data.delta_value as { amount?: unknown } | null)?.amount === "number"
        ? (finding.data.delta_value as { amount: number }).amount
        : null
  });

  if (!opportunity) {
    throw new Error("Finding does not produce a savings opportunity.");
  }

  const result = await insertAdminSavingsOpportunity({
    organizationId: input.organizationId,
    contractId: finding.data.contract_id,
    comparisonId: finding.data.comparison_id,
    opportunity: {
      opportunity_type: opportunity.opportunityType,
      title: opportunity.title,
      estimated_savings_amount: opportunity.estimatedSavingsAmount ?? null,
      currency: opportunity.currency ?? null,
      confidence: opportunity.confidence,
      owner_user_id: input.ownerUserId ?? null,
      evidence: opportunity.evidence
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Savings opportunity was not created.");

  await recordEnterpriseAuditEvent({
    organizationId: result.data.organization_id,
    contractId: result.data.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType: "savings_opportunity.created",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: "warning",
    metadata: safeAuditMetadata({
      opportunityId: result.data.id,
      findingId: finding.data.id,
      comparisonId: result.data.comparison_id,
      estimatedSavingsAmount: result.data.estimated_savings_amount,
      confidence: result.data.confidence
    }),
    mode: "best_effort"
  });

  return result.data;
}

export async function listSavingsOpportunities(input: {
  organizationId: string;
  contractId?: string;
  comparisonId?: string;
  limit?: number;
}) {
  const result = await listAdminSavingsOpportunities(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function updateSavingsOpportunityStatus(input: {
  organizationId: string;
  opportunityId: string;
  actorUserId?: string | null;
  status: Extract<SavingsOpportunity["status"], "dismissed" | "realized" | "accepted" | "in_review">;
  reason?: string | null;
}) {
  const result = await updateAdminSavingsOpportunity({
    organizationId: input.organizationId,
    opportunityId: input.opportunityId,
    values: {
      status: input.status,
      evidence: safeAuditMetadata({ statusReason: input.reason ?? undefined })
    }
  });
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Savings opportunity was not found.");

  await recordEnterpriseAuditEvent({
    organizationId: result.data.organization_id,
    contractId: result.data.contract_id,
    actorUserId: input.actorUserId ?? null,
    eventType:
      input.status === "dismissed"
        ? "savings_opportunity.dismissed"
        : input.status === "realized"
          ? "savings_opportunity.realized"
          : "savings_opportunity.created",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: input.status === "dismissed" ? "info" : "warning",
    metadata: safeAuditMetadata({
      opportunityId: result.data.id,
      comparisonId: result.data.comparison_id,
      status: input.status,
      estimatedSavingsAmount: result.data.estimated_savings_amount,
      confidence: result.data.confidence
    }),
    mode: "best_effort"
  });

  return result.data;
}
