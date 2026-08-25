"use server";

import { revalidatePath } from "next/cache";
import { assertCanUseShippedAction, hasRequiredRole, requireOrganization } from "@/lib/auth";
import { requireScopedContract } from "@/lib/contracts/kernel-queries";
import type {
  CommercialDecisionEvidenceType,
  CommercialRecommendedAction,
  NegotiationPosture
} from "@/lib/commercial-decision-workbench/decision-types";
import {
  approveCommercialDecision,
  archiveCommercialDecision,
  attachDecisionEvidence,
  createCommercialDecisionForContract,
  createDecisionSnapshot,
  finalizeCommercialDecision,
  recomputeCommercialDecision,
  rejectCommercialDecision,
  reassignCommercialDecisionApprover,
  submitCommercialDecisionForReview,
  updateCommercialDecisionNegotiationPosture,
  updateCommercialDecisionRecommendedAction
} from "@/lib/commercial-decision-workbench/commercial-decision-workbench";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";

export type CommercialDecisionActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; code: string };

function contractDecisionPath(contractId: string) {
  return `/dashboard/contracts/${contractId}/commercial-decision`;
}

function safeError(error: unknown): CommercialDecisionActionResult {
  const message = error instanceof Error ? error.message : "Commercial decision action failed.";
  return {
    ok: false,
    message: message.includes("Commercial decision") ? message : "Commercial decision action failed safely.",
    code: "ERR_COMMERCIAL_DECISION_ACTION_FAILED_001"
  };
}

function formString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function requireDecisionOperator() {
  const context = await requireOrganization();
  await assertCanUseShippedAction(context, "review_p0");
  return context;
}

async function requireApproverReassignmentOperator() {
  const context = await requireDecisionOperator();
  if (!hasRequiredRole(context.role, ["admin", "operator"])) {
    throw new Error("Commercial decision approver reassignment requires an admin or operator.");
  }
  return context;
}

async function refreshEvidenceReadiness(input: {
  organizationId: string;
  contractId: string;
  actorUserId: string;
}) {
  await recalculateEvidenceReadiness(input).catch(() => null);
}

export async function createCommercialDecisionAction(contractId: string): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await createCommercialDecisionForContract({
      organizationId: context.organizationId,
      contractId,
      actorUserId: context.user.id
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision created." };
  } catch (error) {
    return safeError(error);
  }
}

export async function recomputeCommercialDecisionAction(
  decisionId: string,
  contractId: string
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await recomputeCommercialDecision({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision recomputed." };
  } catch (error) {
    return safeError(error);
  }
}

export async function submitCommercialDecisionForReviewAction(
  decisionId: string,
  contractId: string,
  formData?: FormData
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await submitCommercialDecisionForReview({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      approverUserId: formData ? formString(formData, "approver_user_id") : null
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision submitted for approval." };
  } catch (error) {
    return safeError(error);
  }
}

export async function reassignCommercialDecisionApproverAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireApproverReassignmentOperator();
    await requireScopedContract(contractId, context.organizationId);
    const newApproverUserId = formString(formData, "approver_user_id");
    if (!newApproverUserId) {
      return {
        ok: false,
        message: "Choose an approver before reassigning this commercial decision.",
        code: "ERR_COMMERCIAL_DECISION_APPROVER_REQUIRED_001"
      };
    }
    await reassignCommercialDecisionApprover({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      newApproverUserId
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision approver reassigned." };
  } catch (error) {
    return safeError(error);
  }
}

export async function approveCommercialDecisionAction(
  decisionId: string,
  contractId: string,
  formData?: FormData
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await approveCommercialDecision({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      reviewerNote: formData ? formString(formData, "reviewer_note") : null
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision approved." };
  } catch (error) {
    return safeError(error);
  }
}

export async function rejectCommercialDecisionAction(
  decisionId: string,
  contractId: string,
  formData?: FormData
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await rejectCommercialDecision({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      reviewerNote: formData ? formString(formData, "reviewer_note") : null
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision rejected." };
  } catch (error) {
    return safeError(error);
  }
}

export async function finalizeCommercialDecisionAction(
  decisionId: string,
  contractId: string
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await finalizeCommercialDecision({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision finalized." };
  } catch (error) {
    return safeError(error);
  }
}

export async function archiveCommercialDecisionAction(
  decisionId: string,
  contractId: string
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await archiveCommercialDecision({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Commercial decision archived." };
  } catch (error) {
    return safeError(error);
  }
}

export async function changeCommercialDecisionRecommendedActionAction(
  decisionId: string,
  contractId: string,
  recommendedAction: CommercialRecommendedAction
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await updateCommercialDecisionRecommendedAction({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      recommendedAction
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Recommended action updated." };
  } catch (error) {
    return safeError(error);
  }
}

export async function changeCommercialDecisionNegotiationPostureAction(
  decisionId: string,
  contractId: string,
  negotiationPosture: NegotiationPosture
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await updateCommercialDecisionNegotiationPosture({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      negotiationPosture
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Negotiation posture updated." };
  } catch (error) {
    return safeError(error);
  }
}

export async function changeCommercialDecisionRecommendedActionFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  const value = formString(formData, "recommended_action") as CommercialRecommendedAction | null;
  if (value) {
    await changeCommercialDecisionRecommendedActionAction(decisionId, contractId, value);
  }
}

export async function changeCommercialDecisionNegotiationPostureFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  const value = formString(formData, "negotiation_posture") as NegotiationPosture | null;
  if (value) {
    await changeCommercialDecisionNegotiationPostureAction(decisionId, contractId, value);
  }
}

export async function attachCommercialDecisionEvidenceAction(
  decisionId: string,
  contractId: string,
  evidenceType: CommercialDecisionEvidenceType,
  evidenceLabel: string,
  evidenceId?: string | null
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await attachDecisionEvidence({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      evidenceType,
      evidenceLabel,
      evidenceId: evidenceId ?? null
    });
    await refreshEvidenceReadiness({ organizationId: context.organizationId, contractId, actorUserId: context.user.id });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Evidence attached." };
  } catch (error) {
    return safeError(error);
  }
}

export async function addCommercialDecisionReviewerNoteAction(
  decisionId: string,
  contractId: string,
  formData: FormData
): Promise<CommercialDecisionActionResult> {
  try {
    const context = await requireDecisionOperator();
    await requireScopedContract(contractId, context.organizationId);
    await createDecisionSnapshot({
      organizationId: context.organizationId,
      decisionId,
      actorUserId: context.user.id,
      snapshotType: formString(formData, "reviewer_note") ? "reviewer_note" : "manual_note",
      reviewerNote: formString(formData, "reviewer_note")
    });
    revalidatePath(contractDecisionPath(contractId));
    return { ok: true, message: "Reviewer note recorded as a safe decision snapshot." };
  } catch (error) {
    return safeError(error);
  }
}

export async function createCommercialDecisionFormAction(contractId: string) {
  await createCommercialDecisionAction(contractId);
}

export async function recomputeCommercialDecisionFormAction(decisionId: string, contractId: string) {
  await recomputeCommercialDecisionAction(decisionId, contractId);
}

export async function submitCommercialDecisionForReviewFormAction(decisionId: string, contractId: string) {
  await submitCommercialDecisionForReviewAction(decisionId, contractId);
}

export async function submitCommercialDecisionForReviewWithApproverFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  await submitCommercialDecisionForReviewAction(decisionId, contractId, formData);
}

export async function approveCommercialDecisionFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  await approveCommercialDecisionAction(decisionId, contractId, formData);
}

export async function rejectCommercialDecisionFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  await rejectCommercialDecisionAction(decisionId, contractId, formData);
}

export async function finalizeCommercialDecisionFormAction(decisionId: string, contractId: string) {
  await finalizeCommercialDecisionAction(decisionId, contractId);
}

export async function archiveCommercialDecisionFormAction(decisionId: string, contractId: string) {
  await archiveCommercialDecisionAction(decisionId, contractId);
}

export async function addCommercialDecisionReviewerNoteFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  await addCommercialDecisionReviewerNoteAction(decisionId, contractId, formData);
}

export async function reassignCommercialDecisionApproverFormAction(
  decisionId: string,
  contractId: string,
  formData: FormData
) {
  await reassignCommercialDecisionApproverAction(decisionId, contractId, formData);
}
