"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { applyAcceptedFieldsToContractMetadata } from "@/lib/contract-intelligence/apply-extracted-fields";
import {
  rejectExtractedField,
  reviewExtractedField,
  editExtractedField
} from "@/lib/contract-intelligence/extraction-runs";
import { runFullDocumentContractExtraction } from "@/lib/contract-intelligence/python-extraction-runner";

function contractPath(contractId: string) {
  return `/dashboard/contracts/${contractId}`;
}

export async function requestContractExtractionAction(contractId: string, fileId?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "preview_extraction");
  await requireScopedContract(contractId, context.organizationId);

  const result = await runFullDocumentContractExtraction({
    organizationId: context.organizationId,
    contractId,
    contractFileId: fileId ?? null,
    requestedByUserId: context.user.id
  });

  revalidatePath(contractPath(contractId));
  return result;
}

export async function reviewExtractedFieldAction(
  contractId: string,
  fieldId: string,
  decision: "accept" | "reject",
  reason?: string | null
) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  await requireScopedContract(contractId, context.organizationId);

  const result =
    decision === "accept"
      ? await reviewExtractedField({
          organizationId: context.organizationId,
          contractId,
          fieldId,
          reviewerUserId: context.user.id
        })
      : await rejectExtractedField({
          organizationId: context.organizationId,
          contractId,
          fieldId,
          reviewerUserId: context.user.id,
          reason
        });

  revalidatePath(contractPath(contractId));
  return result;
}

export async function reviewExtractedFieldFormAction(
  contractId: string,
  fieldId: string,
  decision: "accept" | "reject",
  formData: FormData
) {
  const reason = formData.get("reason");
  await reviewExtractedFieldAction(
    contractId,
    fieldId,
    decision,
    typeof reason === "string" ? reason : null
  );
}

export async function applyAcceptedExtractionFieldsAction(contractId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  await requireScopedContract(contractId, context.organizationId);

  const result = await applyAcceptedFieldsToContractMetadata({
    organizationId: context.organizationId,
    contractId,
    reviewerUserId: context.user.id
  });

  revalidatePath(contractPath(contractId));
  return result;
}

function parseEditedValue(value: string) {
  const normalized = value.trim();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric;
  }
  return normalized;
}

export async function editExtractedFieldFormAction(
  contractId: string,
  fieldId: string,
  formData: FormData
) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  await requireScopedContract(contractId, context.organizationId);
  const value = formData.get("edited_value");
  const reason = formData.get("override_reason");
  if (typeof value !== "string" || !value.trim()) throw new Error("A corrected value is required.");
  if (typeof reason !== "string" || !reason.trim()) throw new Error("An override reason is required.");
  await editExtractedField({
    organizationId: context.organizationId,
    contractId,
    fieldId,
    reviewerUserId: context.user.id,
    editedValue: parseEditedValue(value),
    reason
  });
  revalidatePath(contractPath(contractId));
}

export async function reprocessContractExtractionFormAction(contractId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "preview_extraction");
  await requireScopedContract(contractId, context.organizationId);
  await runFullDocumentContractExtraction({
    organizationId: context.organizationId,
    contractId,
    requestedByUserId: context.user.id,
    forceReprocess: true
  });
  revalidatePath(contractPath(contractId));
}

export async function applyAcceptedExtractionFieldsFormAction(contractId: string) {
  await applyAcceptedExtractionFieldsAction(contractId);
}
