"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import type {
  VendorCommunicationChannel,
  VendorCommunicationDraftType,
  VendorCommunicationTone
} from "@/lib/negotiation-workflow/negotiation-types";
import {
  approveNegotiationBrief,
  approveVendorCommunicationDraftForCopy,
  archiveNegotiationBrief,
  archiveVendorCommunicationDraft,
  createNegotiationBriefForDecision,
  createNegotiationPlaybookItem,
  createVendorCommunicationDraft,
  recomputeNegotiationBrief,
  regenerateVendorCommunicationDraft,
  rejectNegotiationBrief,
  rejectVendorCommunicationDraft,
  submitNegotiationBriefForReview,
  submitVendorCommunicationDraftForApproval
} from "@/lib/negotiation-workflow/negotiation-workflow";

export type NegotiationWorkflowActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code: string };

function contractDecisionPath(contractId: string) {
  return `/dashboard/contracts/${contractId}/commercial-decision`;
}

function safeError(error: unknown): NegotiationWorkflowActionResult {
  const message = error instanceof Error ? error.message : "Negotiation workflow action failed.";
  return {
    ok: false,
    message:
      message.includes("Negotiation") || message.includes("Vendor") || message.includes("approver")
        ? message
        : "Negotiation workflow action failed safely.",
    code: "ERR_NEGOTIATION_WORKFLOW_ACTION_FAILED_001"
  };
}

function formString(formData: FormData | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireNegotiationOperator(contractId: string) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  await requireScopedContract(contractId, context.organizationId);
  return context;
}

export async function createNegotiationBriefAction(
  commercialDecisionId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await createNegotiationBriefForDecision({
      organizationId: context.organizationId,
      commercialDecisionId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief created." };
  } catch (error) {
    return safeError(error);
  }
}

export async function recomputeNegotiationBriefAction(
  negotiationBriefId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await recomputeNegotiationBrief({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief recomputed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function submitNegotiationBriefAction(
  negotiationBriefId: string,
  contractId: string,
  formData?: FormData
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await submitNegotiationBriefForReview({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id,
      approverUserId: formString(formData, "approver_user_id")
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief submitted for review." };
  } catch (error) {
    return safeError(error);
  }
}

export async function approveNegotiationBriefAction(
  negotiationBriefId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await approveNegotiationBrief({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief approved." };
  } catch (error) {
    return safeError(error);
  }
}

export async function rejectNegotiationBriefAction(
  negotiationBriefId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await rejectNegotiationBrief({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief rejected." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveNegotiationBriefAction(
  negotiationBriefId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await archiveNegotiationBrief({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation brief archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createVendorCommunicationDraftAction(
  negotiationBriefId: string,
  contractId: string,
  formData?: FormData
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await createVendorCommunicationDraft({
      organizationId: context.organizationId,
      negotiationBriefId,
      actorUserId: context.user.id,
      draftType: (formString(formData, "draft_type") as VendorCommunicationDraftType | null) ?? "request_renewal_quote",
      channel: (formString(formData, "channel") as VendorCommunicationChannel | null) ?? "email",
      tone: (formString(formData, "tone") as VendorCommunicationTone | null) ?? "neutral"
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Draft-only vendor communication created." };
  } catch (error) {
    return safeError(error);
  }
}

export async function regenerateVendorCommunicationDraftAction(
  draftId: string,
  contractId: string,
  formData?: FormData
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await regenerateVendorCommunicationDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id,
      draftType: (formString(formData, "draft_type") as VendorCommunicationDraftType | null) ?? undefined,
      channel: (formString(formData, "channel") as VendorCommunicationChannel | null) ?? undefined,
      tone: (formString(formData, "tone") as VendorCommunicationTone | null) ?? undefined
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Draft-only vendor communication regenerated." };
  } catch (error) {
    return safeError(error);
  }
}

export async function submitVendorCommunicationDraftAction(
  draftId: string,
  contractId: string,
  formData?: FormData
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await submitVendorCommunicationDraftForApproval({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id,
      approverUserId: formString(formData, "approver_user_id")
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Vendor draft submitted for approval." };
  } catch (error) {
    return safeError(error);
  }
}

export async function approveVendorCommunicationDraftForCopyAction(
  draftId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await approveVendorCommunicationDraftForCopy({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Vendor draft approved for manual copy." };
  } catch (error) {
    return safeError(error);
  }
}

export async function rejectVendorCommunicationDraftAction(
  draftId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await rejectVendorCommunicationDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Vendor draft rejected." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveVendorCommunicationDraftAction(
  draftId: string,
  contractId: string
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await archiveVendorCommunicationDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Vendor draft archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createNegotiationPlaybookItemAction(
  commercialDecisionId: string,
  contractId: string,
  formData: FormData
): Promise<NegotiationWorkflowActionResult> {
  try {
    const context = await requireNegotiationOperator(contractId);
    await createNegotiationPlaybookItem({
      organizationId: context.organizationId,
      commercialDecisionId,
      actorUserId: context.user.id,
      negotiationBriefId: formString(formData, "negotiation_brief_id"),
      title: formString(formData, "title") ?? "Negotiation follow-up",
      body: formString(formData, "body") ?? "Review negotiation evidence."
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation playbook item created." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createNegotiationBriefFormAction(commercialDecisionId: string, contractId: string) {
  await createNegotiationBriefAction(commercialDecisionId, contractId);
}

export async function recomputeNegotiationBriefFormAction(negotiationBriefId: string, contractId: string) {
  await recomputeNegotiationBriefAction(negotiationBriefId, contractId);
}

export async function submitNegotiationBriefFormAction(negotiationBriefId: string, contractId: string, formData: FormData) {
  await submitNegotiationBriefAction(negotiationBriefId, contractId, formData);
}

export async function approveNegotiationBriefFormAction(negotiationBriefId: string, contractId: string) {
  await approveNegotiationBriefAction(negotiationBriefId, contractId);
}

export async function rejectNegotiationBriefFormAction(negotiationBriefId: string, contractId: string) {
  await rejectNegotiationBriefAction(negotiationBriefId, contractId);
}

export async function archiveNegotiationBriefFormAction(negotiationBriefId: string, contractId: string) {
  await archiveNegotiationBriefAction(negotiationBriefId, contractId);
}

export async function createVendorCommunicationDraftFormAction(negotiationBriefId: string, contractId: string, formData: FormData) {
  await createVendorCommunicationDraftAction(negotiationBriefId, contractId, formData);
}

export async function regenerateVendorCommunicationDraftFormAction(draftId: string, contractId: string, formData: FormData) {
  await regenerateVendorCommunicationDraftAction(draftId, contractId, formData);
}

export async function submitVendorCommunicationDraftFormAction(draftId: string, contractId: string, formData: FormData) {
  await submitVendorCommunicationDraftAction(draftId, contractId, formData);
}

export async function approveVendorCommunicationDraftForCopyFormAction(draftId: string, contractId: string) {
  await approveVendorCommunicationDraftForCopyAction(draftId, contractId);
}

export async function rejectVendorCommunicationDraftFormAction(draftId: string, contractId: string) {
  await rejectVendorCommunicationDraftAction(draftId, contractId);
}

export async function archiveVendorCommunicationDraftFormAction(draftId: string, contractId: string) {
  await archiveVendorCommunicationDraftAction(draftId, contractId);
}

export async function createNegotiationPlaybookItemFormAction(commercialDecisionId: string, contractId: string, formData: FormData) {
  await createNegotiationPlaybookItemAction(commercialDecisionId, contractId, formData);
}
