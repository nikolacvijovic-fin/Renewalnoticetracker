import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { buildCommercialAnalysis } from "@/lib/contract-intelligence/commercial-analysis";
import {
  getAdminOrganizationTimezone,
  listAdminContractDocumentRelationships,
  listAdminContractExtractedFields,
  replaceAdminCommercialAnalysis
} from "@/lib/contract-intelligence/repositories/admin-extraction-repository";

export async function refreshCommercialAnalysis(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
  extractionRunId?: string | null;
}) {
  const fields = await listAdminContractExtractedFields({
    organizationId: input.organizationId,
    contractId: input.contractId
  });
  if (fields.error) throw fields.error;
  const [organization, relationships] = await Promise.all([
    getAdminOrganizationTimezone({ organizationId: input.organizationId }),
    listAdminContractDocumentRelationships({
      organizationId: input.organizationId,
      contractId: input.contractId
    })
  ]);
  if (organization.error) throw organization.error;
  if (relationships.error) throw relationships.error;
  const analysis = buildCommercialAnalysis(
    fields.data ?? [],
    undefined,
    organization.data?.timezone ?? null,
    relationships.data ?? []
  );
  const persisted = await replaceAdminCommercialAnalysis({
    organizationId: input.organizationId,
    contractId: input.contractId,
    extractionRunId: input.extractionRunId ?? null,
    calculations: analysis.calculations.map((calculation) => ({
      calculation_type: calculation.calculationType,
      calculation_version: calculation.calculationVersion,
      status: calculation.status,
      amount: calculation.amount,
      currency: calculation.currency,
      percentage: calculation.percentage,
      date_value: calculation.dateValue,
      explanation: calculation.explanation,
      source_field_ids: calculation.sourceFieldIds,
      warning_codes: calculation.warningCodes
    })),
    findings: analysis.findings.map((finding) => ({
      reason_code: finding.reasonCode,
      severity: finding.severity,
      confidence: finding.confidence,
      explanation: finding.explanation,
      financial_impact_min: finding.financialImpactMin,
      financial_impact_max: finding.financialImpactMax,
      currency: finding.currency,
      evidence_field_ids: finding.evidenceFieldIds,
      limitations: finding.limitations,
      recommended_human_action: finding.recommendedHumanAction,
      calculation_version: finding.calculationVersion,
      taxonomy_version: finding.taxonomyVersion,
      status: "open"
    }))
  });
  if (persisted.error) throw persisted.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.actorUserId ?? null,
    eventType: "contract_commercial_analysis.generated",
    eventCategory: "evidence",
    eventSource: "commercial_contract_intelligence",
    severity: analysis.conflicts.some((conflict) => conflict.status === "unresolved") ? "warning" : "info",
    metadata: {
      extractionRunId: input.extractionRunId ?? null,
      calculationCount: analysis.calculations.length,
      findingCount: analysis.findings.length,
      findingReasonCodes: analysis.findings.map((finding) => finding.reasonCode),
      unresolvedConflictCount: analysis.conflicts.filter((conflict) => conflict.status === "unresolved").length,
      supportedPrecedenceCount: analysis.conflicts.filter((conflict) => conflict.status === "supported_precedence").length,
      acceptedFieldCount: analysis.acceptedFieldCount,
      pendingFieldCount: analysis.pendingFieldCount
    },
    mode: "best_effort"
  });
  return analysis;
}
