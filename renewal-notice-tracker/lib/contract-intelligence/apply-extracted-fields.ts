import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { mapExtractedFieldsToContractMetadataPatch } from "@/lib/contract-intelligence/extraction-evidence";
import {
  getAdminContractMetadataForPatch,
  listAdminContractExtractedFields,
  markAdminExtractedFieldsApplied,
  updateAdminContractMetadataFromExtraction
} from "@/lib/contract-intelligence/repositories/admin-extraction-repository";
import type { ApplyExtractedFieldInput } from "@/lib/contract-intelligence/extraction-types";

export async function applyAcceptedFieldsToContractMetadata(input: ApplyExtractedFieldInput) {
  const [metadataResult, fieldsResult] = await Promise.all([
    getAdminContractMetadataForPatch({
      organizationId: input.organizationId,
      contractId: input.contractId
    }),
    listAdminContractExtractedFields({
      organizationId: input.organizationId,
      contractId: input.contractId,
      evidenceStatus: "accepted"
    })
  ]);

  if (metadataResult.error) throw metadataResult.error;
  if (fieldsResult.error) throw fieldsResult.error;
  if (!metadataResult.data) throw new Error("Contract metadata not found for active organization.");

  const selectedFieldIds = new Set(input.fieldIds ?? []);
  const fields = (fieldsResult.data ?? []).filter((field) =>
    selectedFieldIds.size === 0 ? true : selectedFieldIds.has(field.id)
  );

  const now = new Date().toISOString();
  const patch = mapExtractedFieldsToContractMetadataPatch({
    fields,
    existingFieldConfidence: metadataResult.data.field_confidence,
    existingFieldSourceSnippets: metadataResult.data.field_source_snippets,
    now
  });

  const updateResult = await updateAdminContractMetadataFromExtraction({
    metadataId: metadataResult.data.id,
    patch
  });
  if (updateResult.error) throw updateResult.error;

  const applied = await markAdminExtractedFieldsApplied({
    organizationId: input.organizationId,
    contractId: input.contractId,
    fieldIds: fields.map((field) => field.id),
    appliedAt: now
  });
  if (applied.error) throw applied.error;

  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    contractId: input.contractId,
    actorUserId: input.reviewerUserId,
    eventType: "contract_extracted_fields.applied_to_metadata",
    eventCategory: "evidence",
    eventSource: "contract_extraction",
    severity: patch.has_weak_evidence ? "warning" : "info",
    metadata: {
      fieldIds: fields.map((field) => field.id),
      fieldKeys: fields.map((field) => field.field_key),
      confidenceValues: fields.map((field) => field.confidence),
      weakEvidence: patch.has_weak_evidence,
      needsReview: patch.needs_review,
      reviewerId: input.reviewerUserId
    },
    mode: "best_effort"
  });

  return {
    appliedFields: applied.data ?? [],
    metadataPatch: patch
  };
}
