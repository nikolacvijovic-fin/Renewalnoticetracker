"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import { applyAcceptedFieldsToContractMetadata } from "@/lib/contract-intelligence/apply-extracted-fields";
import {
  rejectExtractedField,
  reviewExtractedField
} from "@/lib/contract-intelligence/extraction-runs";
import { runPythonContractExtraction } from "@/lib/contract-intelligence/python-extraction-runner";

function contractPath(contractId: string) {
  return `/dashboard/contracts/${contractId}`;
}

export async function requestContractExtractionAction(contractId: string, fileId?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "preview_extraction");
  await requireScopedContract(contractId, context.organizationId);

  const result = await runPythonContractExtraction({
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

export async function applyAcceptedExtractionFieldsFormAction(contractId: string) {
  await applyAcceptedExtractionFieldsAction(contractId);
}
