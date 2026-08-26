import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import {
  buildCommercialEvidenceFingerprint,
  normalizeCommercialTerms
} from "@/lib/quote-comparison/commercial-comparison-engine";
import type { CommercialBaselineDraft } from "@/lib/quote-comparison/commercial-baseline";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type RpcResult = { data: string | null; error: { message: string } | null };

export async function createImmutableCommercialBaseline(input: {
  organizationId: string;
  actorUserId: string;
  draft: CommercialBaselineDraft;
}) {
  const normalized = normalizeCommercialTerms(input.draft.terms, { requireAcceptedEvidence: true });
  const evidenceFingerprint = buildCommercialEvidenceFingerprint({
    sourceExtractionRunId: input.draft.sourceExtractionRunId,
    sourceExtractionRunIds: input.draft.sourceExtractionRunIds,
    evidenceFieldIds: [...input.draft.evidenceFieldIds].sort(),
    terms: normalized
  });
  const lineItems = normalized.lineItems.map((item) => ({
    line_key: item.lineKey,
    product_name: item.productName,
    sku: item.sku ?? null,
    charge_type: item.chargeType,
    pricing_model: item.pricingModel,
    billing_period: item.billingPeriod,
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice ?? null,
    total_amount: item.totalAmount ?? null,
    annualized_amount: item.annualizedAmount,
    total_commitment_amount: item.totalCommitmentAmount,
    currency: item.currency,
    term_months: item.termMonths ?? null,
    service_period_months: item.servicePeriodMonths ?? null,
    discount_amount: item.discountAmount ?? null,
    discount_percent: item.discountPercent ?? null,
    evidence_field_ids: item.evidence.filter((reference) => reference.state === "accepted").map((reference) => reference.evidenceId),
    warning_codes: item.warnings
  }));
  const supabase = createServerSupabaseClient();
  const result = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>
  ) => Promise<RpcResult>)("create_reviewed_commercial_baseline", {
    p_organization_id: input.organizationId,
    p_contract_id: input.draft.contractId,
    p_source_extraction_run_id: input.draft.sourceExtractionRunId,
    p_source_extraction_run_ids: input.draft.sourceExtractionRunIds,
    p_source_file_ids: input.draft.sourceFileIds,
    p_effective_date: input.draft.effectiveDate,
    p_reviewed_by_user_id: input.actorUserId,
    p_calculation_version: input.draft.calculationVersion,
    p_completeness_status: input.draft.completenessStatus,
    p_missing_data_warnings: input.draft.missingDataWarnings,
    p_evidence_field_ids: input.draft.evidenceFieldIds,
    p_evidence_fingerprint: evidenceFingerprint,
    p_terms_snapshot: normalized,
    p_line_items: lineItems
  });
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Commercial baseline was not created.");

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.draft.contractId,
    actorUserId: input.actorUserId,
    eventType: "commercial_baseline.version_created",
    eventCategory: "evidence",
    eventSource: "renewal_quote_comparison",
    severity: input.draft.completenessStatus === "insufficient" ? "warning" : "info",
    metadata: sanitizeQuoteEvidence({
      baselineId: result.data,
      sourceExtractionRunId: input.draft.sourceExtractionRunId,
      evidenceFingerprint,
      evidenceFieldCount: input.draft.evidenceFieldIds.length,
      lineItemCount: lineItems.length,
      completenessStatus: input.draft.completenessStatus,
      warningCodes: input.draft.missingDataWarnings,
      calculationVersion: input.draft.calculationVersion
    }) as Record<string, unknown>,
    mode: "best_effort"
  });
  return { baselineId: result.data, evidenceFingerprint, normalized };
}
