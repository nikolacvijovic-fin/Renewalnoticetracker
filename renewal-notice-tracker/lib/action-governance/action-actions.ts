import { evaluateGovernedActionPolicy, canTransitionGovernedAction } from "@/lib/action-governance/action-policy";
import { createGovernedActionLifecycleEvent, createNoSendBoundaryEvent } from "@/lib/action-governance/action-events";
import type { DomainEvent } from "@/lib/events/domain-event-types";
import type {
  GovernedActionLifecycleInput,
  GovernedActionRecord,
  GovernedActionStatus
} from "@/lib/action-governance/action-types";

function statusForTransition(transition: GovernedActionLifecycleInput["transition"]): GovernedActionStatus {
  if (transition === "block") return "blocked";
  if (transition === "mark_ready") return "ready";
  if (transition === "approve") return "approved";
  if (transition === "complete_manually") return "completed_manually";
  if (transition === "dismiss") return "dismissed";
  if (transition === "accept_risk") return "accepted_risk";
  if (transition === "supersede") return "superseded";
  return "proposed";
}

function transitionRequiresReason(transition: GovernedActionLifecycleInput["transition"]) {
  return transition === "dismiss" || transition === "accept_risk" || transition === "supersede";
}

export function applyGovernedActionLifecycleTransition(
  action: GovernedActionRecord,
  input: GovernedActionLifecycleInput
): { action: GovernedActionRecord; events: DomainEvent[] } {
  if (transitionRequiresReason(input.transition) && !input.reason?.trim()) {
    throw new Error("Governed action transition requires a human-readable reason.");
  }
  const context = {
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    linkedOwnerUserId: input.linkedOwnerUserId,
    importRowStatus: input.importRowStatus,
    aiFactReviewedByUserId: input.aiFactReviewedByUserId,
    explicitManualOutsideNoticeControlConfirmation: input.explicitManualOutsideNoticeControlConfirmation,
    evidenceCodes: input.evidenceCodes,
    reason: input.reason
  };
  if (!canTransitionGovernedAction({ action, transition: input.transition, context })) {
    const policy = evaluateGovernedActionPolicy(action, context);
    throw new Error(policy.customerSafeMessage);
  }

  const now = input.now ?? new Date().toISOString();
  const fromStatus = action.status;
  const nextStatus = statusForTransition(input.transition);
  const next: GovernedActionRecord = {
    ...action,
    status: nextStatus,
    approvedAt: input.transition === "approve" ? now : input.transition === "reopen" ? null : action.approvedAt,
    approverUserId: input.transition === "approve" ? input.actorUserId : input.transition === "reopen" ? null : action.approverUserId,
    completedAt: input.transition === "complete_manually" ? now : input.transition === "reopen" ? null : action.completedAt,
    completedByUserId: input.transition === "complete_manually" ? input.actorUserId : input.transition === "reopen" ? null : action.completedByUserId,
    supersededByActionId: input.transition === "supersede" ? input.supersededByActionId ?? null : action.supersededByActionId,
    updatedAt: now,
    metadata: {
      ...action.metadata,
      lastLifecycleReason: input.reason?.trim() ?? null,
      manualOnly: input.transition === "complete_manually" ? true : action.metadata.manualOnly ?? null
    }
  };

  const events = [
    createGovernedActionLifecycleEvent({
      action: next,
      actorUserId: input.actorUserId,
      transition: input.transition,
      fromStatus,
      occurredAt: now,
      reasonCode: input.reason?.trim() ?? null
    })
  ];

  if (
    action.actionType === "mark_notice_sent_manually" ||
    action.actionType === "record_vendor_reply" ||
    action.actionType === "record_manual_opt_out_decision"
  ) {
    events.push(createNoSendBoundaryEvent({
      action: next,
      actorUserId: input.actorUserId,
      occurredAt: now,
      blocked: false
    }));
  }

  return { action: next, events };
}
