"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import {
  approveOutreachDraftForCopy,
  archiveOutreachDraft,
  archiveOutreachOpportunity,
  buildCrmNoteForOpportunity,
  createOutreachDraft,
  createOutreachOpportunityFromDecision,
  createOutreachPlaybookItem,
  createOutreachSuppression,
  detectOutreachOpportunitiesForContract,
  dismissDuplicateOutreachOpportunity,
  dismissOutreachOpportunity,
  planOutreachSequence,
  recomputeOutreachOpportunity,
  regenerateOutreachDraft,
  rejectOutreachDraft,
  refreshOutreachOpportunityIntelligence,
  resolveOutreachAudience,
  scoreOutreachOpportunity,
  submitOutreachDraftForApproval
} from "@/lib/internal-outreach-intelligence/internal-outreach-intelligence";
import type {
  OutreachAudience,
  OutreachChannel,
  OutreachTone
} from "@/lib/internal-outreach-intelligence/outreach-types";

export type InternalOutreachActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code: string };

function contractOutreachPath(contractId: string) {
  return `/dashboard/contracts/${contractId}/internal-outreach`;
}

function safeError(error: unknown): InternalOutreachActionResult {
  const message = error instanceof Error ? error.message : "Internal outreach action failed.";
  return {
    ok: false,
    message:
      message.includes("Internal outreach") ||
      message.includes("suppression") ||
      message.includes("approver") ||
      message.includes("Blocked")
        ? message
        : "Internal outreach action failed safely.",
    code: "ERR_INTERNAL_OUTREACH_ACTION_FAILED_001"
  };
}

function formString(formData: FormData | undefined, key: string) {
  const value = formData?.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireOutreachOperator(contractId?: string | null) {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  if (contractId) {
    await requireScopedContract(contractId, context.organizationId);
  }
  return context;
}

function revalidateOutreach(contractId?: string | null) {
  revalidatePath("/dashboard/internal-outreach");
  if (contractId) {
    revalidatePath(contractOutreachPath(contractId));
    revalidatePath(`/dashboard/contracts/${contractId}`);
    revalidatePath(`/dashboard/contracts/${contractId}/commercial-decision`);
  }
}

export async function detectOutreachOpportunitiesAction(
  contractId: string
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    const opportunities = await detectOutreachOpportunitiesForContract({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return {
      ok: true,
      message: opportunities.length
        ? "Internal outreach opportunities refreshed."
        : "No internal outreach opportunities detected yet."
    };
  } catch (error) {
    return safeError(error);
  }
}

export async function createOutreachOpportunityFromDecisionAction(
  commercialDecisionId: string,
  contractId: string
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await createOutreachOpportunityFromDecision({
      organizationId: context.organizationId,
      commercialDecisionId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach opportunities created from decision evidence." };
  } catch (error) {
    return safeError(error);
  }
}

export async function recomputeOutreachOpportunityAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await recomputeOutreachOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach opportunity recomputed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function dismissOutreachOpportunityAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await dismissOutreachOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach opportunity dismissed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveOutreachOpportunityAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await archiveOutreachOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach opportunity archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function refreshOutreachOpportunityIntelligenceAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await refreshOutreachOpportunityIntelligence({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach guidance refreshed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function scoreOutreachOpportunityAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await scoreOutreachOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach priority scored." };
  } catch (error) {
    return safeError(error);
  }
}

export async function resolveOutreachAudienceAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await resolveOutreachAudience({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach audience resolved." };
  } catch (error) {
    return safeError(error);
  }
}

export async function planOutreachSequenceAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await planOutreachSequence({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach sequence planned." };
  } catch (error) {
    return safeError(error);
  }
}

export async function buildCrmNoteForOpportunityAction(
  opportunityId: string,
  contractId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await buildCrmNoteForOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal CRM note preview prepared for manual copy." };
  } catch (error) {
    return safeError(error);
  }
}

export async function dismissDuplicateOutreachOpportunityAction(
  opportunityId: string,
  contractId?: string | null,
  duplicateOfOpportunityId?: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await dismissDuplicateOutreachOpportunity({
      organizationId: context.organizationId,
      opportunityId,
      duplicateOfOpportunityId: duplicateOfOpportunityId ?? null,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Duplicate internal outreach opportunity dismissed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createOutreachDraftAction(
  opportunityId: string,
  contractId: string | null,
  formData?: FormData
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await createOutreachDraft({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id,
      channel: (formString(formData, "channel") as OutreachChannel | null) ?? "internal_email",
      tone: (formString(formData, "tone") as OutreachTone | null) ?? "concise"
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft created. No message was sent." };
  } catch (error) {
    return safeError(error);
  }
}

export async function regenerateOutreachDraftAction(
  draftId: string,
  contractId: string | null,
  formData?: FormData
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await regenerateOutreachDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id,
      channel: (formString(formData, "channel") as OutreachChannel | null) ?? undefined,
      tone: (formString(formData, "tone") as OutreachTone | null) ?? undefined
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft regenerated. No message was sent." };
  } catch (error) {
    return safeError(error);
  }
}

export async function submitOutreachDraftForApprovalAction(
  draftId: string,
  contractId: string | null,
  formData?: FormData
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await submitOutreachDraftForApproval({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id,
      approverUserId: formString(formData, "approver_user_id")
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft submitted for approval." };
  } catch (error) {
    return safeError(error);
  }
}

export async function approveOutreachDraftForCopyAction(
  draftId: string,
  contractId: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await approveOutreachDraftForCopy({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft approved for manual copy. No message was sent." };
  } catch (error) {
    return safeError(error);
  }
}

export async function rejectOutreachDraftAction(
  draftId: string,
  contractId: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await rejectOutreachDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft rejected." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveOutreachDraftAction(
  draftId: string,
  contractId: string | null
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await archiveOutreachDraft({
      organizationId: context.organizationId,
      draftId,
      actorUserId: context.user.id
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal draft archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createOutreachPlaybookItemAction(
  opportunityId: string,
  contractId: string | null,
  formData: FormData
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await createOutreachPlaybookItem({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id,
      title: formString(formData, "title") ?? "Internal outreach follow-up",
      body: formString(formData, "body") ?? "Review internal outreach evidence."
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal playbook item created." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createOutreachSuppressionAction(
  opportunityId: string,
  contractId: string | null,
  formData: FormData
): Promise<InternalOutreachActionResult> {
  try {
    const context = await requireOutreachOperator(contractId);
    await createOutreachSuppression({
      organizationId: context.organizationId,
      opportunityId,
      actorUserId: context.user.id,
      audience: (formString(formData, "audience") as OutreachAudience | null) ?? "internal_owner",
      contactIdentifier: formString(formData, "contact_identifier"),
      scopedInternalUserId: formString(formData, "scoped_internal_user_id"),
      reasonCode: formString(formData, "reason_code") ?? "manual_suppression",
      notesPreview: formString(formData, "notes_preview"),
      expiresAt: formString(formData, "expires_at")
    });
    revalidateOutreach(contractId);
    return { ok: true, message: "Internal outreach suppression recorded." };
  } catch (error) {
    return safeError(error);
  }
}

export async function detectOutreachOpportunitiesFormAction(contractId: string) {
  await detectOutreachOpportunitiesAction(contractId);
}

export async function createOutreachOpportunityFromDecisionFormAction(commercialDecisionId: string, contractId: string) {
  await createOutreachOpportunityFromDecisionAction(commercialDecisionId, contractId);
}

export async function recomputeOutreachOpportunityFormAction(opportunityId: string, contractId?: string | null) {
  await recomputeOutreachOpportunityAction(opportunityId, contractId);
}

export async function dismissOutreachOpportunityFormAction(opportunityId: string, contractId?: string | null) {
  await dismissOutreachOpportunityAction(opportunityId, contractId);
}

export async function archiveOutreachOpportunityFormAction(opportunityId: string, contractId?: string | null) {
  await archiveOutreachOpportunityAction(opportunityId, contractId);
}

export async function refreshOutreachOpportunityIntelligenceFormAction(opportunityId: string, contractId?: string | null) {
  await refreshOutreachOpportunityIntelligenceAction(opportunityId, contractId);
}

export async function dismissDuplicateOutreachOpportunityFormAction(opportunityId: string, contractId?: string | null, formData?: FormData) {
  await dismissDuplicateOutreachOpportunityAction(opportunityId, contractId, formString(formData, "duplicate_of_opportunity_id"));
}

export async function createOutreachDraftFormAction(opportunityId: string, contractId: string | null, formData: FormData) {
  await createOutreachDraftAction(opportunityId, contractId, formData);
}

export async function regenerateOutreachDraftFormAction(draftId: string, contractId: string | null, formData: FormData) {
  await regenerateOutreachDraftAction(draftId, contractId, formData);
}

export async function submitOutreachDraftForApprovalFormAction(draftId: string, contractId: string | null, formData: FormData) {
  await submitOutreachDraftForApprovalAction(draftId, contractId, formData);
}

export async function approveOutreachDraftForCopyFormAction(draftId: string, contractId: string | null) {
  await approveOutreachDraftForCopyAction(draftId, contractId);
}

export async function rejectOutreachDraftFormAction(draftId: string, contractId: string | null) {
  await rejectOutreachDraftAction(draftId, contractId);
}

export async function archiveOutreachDraftFormAction(draftId: string, contractId: string | null) {
  await archiveOutreachDraftAction(draftId, contractId);
}

export async function createOutreachPlaybookItemFormAction(opportunityId: string, contractId: string | null, formData: FormData) {
  await createOutreachPlaybookItemAction(opportunityId, contractId, formData);
}

export async function createOutreachSuppressionFormAction(opportunityId: string, contractId: string | null, formData: FormData) {
  await createOutreachSuppressionAction(opportunityId, contractId, formData);
}
