"use server";

import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { getContractById, requireScopedContract } from "@/lib/contracts/kernel-queries";
import {
  RENEWAL_MANUAL_TEMPLATE_TYPES,
  type RenewalManualTemplateType
} from "@/lib/contracts/renewal-action-templates";

function assertTemplateType(value: string): asserts value is RenewalManualTemplateType {
  if (!RENEWAL_MANUAL_TEMPLATE_TYPES.includes(value as RenewalManualTemplateType)) {
    throw new Error("Unsupported renewal manual template type.");
  }
}

function firstValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function specificTemplateAuditAction(templateType: RenewalManualTemplateType) {
  return templateType === "cancellation_notice"
    ? "renewal.cancellation_template_copied"
    : "renewal.renegotiation_template_copied";
}

export async function recordRenewalManualTemplateCopyAction(
  contractId: string,
  templateType: RenewalManualTemplateType | string
) {
  assertTemplateType(templateType);
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "record_decision", {
    organizationId: context.organizationId,
    assertScoped: async (organizationId) => {
      await requireScopedContract(contractId, organizationId);
    }
  });

  const contract = await getContractById(contractId, context.organizationId);
  const metadata = firstValue(contract.contract_metadata);
  const details = {
    templateType,
    hasNoticeDeadline: Boolean(metadata?.notice_deadline_date),
    hasRenewalDate: Boolean(metadata?.renewal_date),
    hasExpirationDate: Boolean(metadata?.expiration_date)
  };

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId,
    action: "renewal.template_copied",
    entityType: "renewal_manual_template",
    entityId: contractId,
    details
  });

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    contractId,
    action: specificTemplateAuditAction(templateType),
    entityType: "renewal_manual_template",
    entityId: contractId,
    details
  });

  return { ok: true };
}
