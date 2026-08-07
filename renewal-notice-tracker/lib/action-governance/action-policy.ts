import type {
  GovernedActionPolicyContext,
  GovernedActionPolicyResult,
  GovernedActionRecord,
  GovernedActionRequiredRole,
  GovernedActionTransition
} from "@/lib/action-governance/action-types";
import type { DecisionActorRole } from "@/lib/decision-intelligence/decision-types";

const ROLE_RANK: Record<DecisionActorRole, number> = {
  viewer: 0,
  member: 1,
  owner: 2,
  reviewer: 3,
  operator: 4,
  admin: 5
};

const REQUIRED_ROLE_RANK: Record<GovernedActionRequiredRole, number> = {
  owner: 2,
  reviewer: 3,
  operator: 4,
  admin: 5
};

const TRUST_ACTIONS = new Set(["resolve_metadata_conflict", "review_ai_fact", "accept_weak_evidence"]);
const MANUAL_NOTICE_ACTIONS = new Set(["mark_notice_sent_manually", "record_vendor_reply", "record_manual_opt_out_decision"]);

function isLinkedOwner(action: GovernedActionRecord, context: GovernedActionPolicyContext) {
  return context.actorRole === "owner" &&
    Boolean(context.linkedOwnerUserId) &&
    context.linkedOwnerUserId === context.actorUserId &&
    action.ownerUserId === context.actorUserId;
}

function roleMeetsRequired(action: GovernedActionRecord, context: GovernedActionPolicyContext) {
  if (context.actorRole === "admin") return true;
  if (isLinkedOwner(action, context)) return true;
  return ROLE_RANK[context.actorRole] >= REQUIRED_ROLE_RANK[action.requiredRole];
}

function blocked(reasonCodes: string[], message: string): GovernedActionPolicyResult {
  return {
    allowed: false,
    status: "blocked",
    reasonCodes,
    customerSafeMessage: message
  };
}

function ready(reasonCodes: string[] = ["action_ready"]): GovernedActionPolicyResult {
  return {
    allowed: true,
    status: "ready",
    reasonCodes,
    customerSafeMessage: "This manual action is allowed with the required evidence and audit trail."
  };
}

export function isNoSendProtectedAction(action: Pick<GovernedActionRecord, "actionType">) {
  return MANUAL_NOTICE_ACTIONS.has(action.actionType);
}

export function evaluateGovernedActionPolicy(
  action: GovernedActionRecord,
  context: GovernedActionPolicyContext
): GovernedActionPolicyResult {
  if (action.status === "superseded") {
    return blocked(["action_superseded"], "This action was superseded and cannot be completed.");
  }
  if (action.status === "dismissed" || action.status === "accepted_risk" || action.status === "completed_manually") {
    return blocked(["terminal_status"], "This action is already in a terminal state.");
  }
  if (!roleMeetsRequired(action, context)) {
    return blocked(["permission_denied"], "Your role is not allowed to complete this action.");
  }
  if (action.actionType === "accept_renewal_risk" && context.actorRole !== "admin" && context.actorRole !== "operator") {
    return blocked(["admin_or_operator_required"], "Accepting renewal risk requires an admin or operator.");
  }
  if (TRUST_ACTIONS.has(action.actionType) && action.requiredRole === "reviewer" && !["reviewer", "operator", "admin", "owner"].includes(context.actorRole)) {
    return blocked(["review_role_required"], "Trust decisions require a reviewer, operator, admin, or linked owner.");
  }
  if (action.actionType === "activate_import_row" && !["ready", "corrected"].includes(String(context.importRowStatus ?? ""))) {
    return blocked(["import_row_not_ready"], "Imported rows must be ready or corrected before activation.");
  }
  if (action.actionType === "review_ai_fact" && context.aiFactSource === "ai" && context.aiFactReviewedByUserId === context.actorUserId) {
    return blocked(["ai_self_approval_blocked"], "AI-proposed facts require independent human review.");
  }
  if (isNoSendProtectedAction(action) && !context.explicitManualOutsideNoticeControlConfirmation) {
    return blocked(
      ["manual_outside_noticecontrol_confirmation_required"],
      "Confirm this was handled manually outside NoticeControl. NoticeControl will not send or contact anyone."
    );
  }
  const missingEvidence = action.requiredEvidence
    .filter((item) => item.required)
    .filter((item) => !(context.evidenceCodes ?? []).includes(item.code));
  if (missingEvidence.length > 0) {
    return blocked(["required_evidence_missing"], "Required evidence must be attached before this action can proceed.");
  }
  if ((action.actionType === "accept_weak_evidence" || action.actionType === "accept_renewal_risk") && !context.reason?.trim()) {
    return blocked(["reason_required"], "This action requires a human-readable reason.");
  }
  if (action.status === "blocked") {
    return {
      allowed: false,
      status: "requires_approval",
      reasonCodes: ["blocked_action_requires_review"],
      customerSafeMessage: action.blockedReason ?? "This action is blocked until review."
    };
  }
  return ready();
}

export function canTransitionGovernedAction(input: {
  action: GovernedActionRecord;
  transition: GovernedActionTransition;
  context: GovernedActionPolicyContext;
}) {
  if (!input.action.allowedTransitions.includes(input.transition)) return false;
  if (input.transition === "reopen") {
    return ["reviewer", "operator", "admin"].includes(input.context.actorRole) || isLinkedOwner(input.action, input.context);
  }
  if (input.transition === "supersede") return ["operator", "admin"].includes(input.context.actorRole);
  if (input.transition === "accept_risk") return ["operator", "admin"].includes(input.context.actorRole) && Boolean(input.context.reason?.trim());
  if (input.transition === "dismiss") return ["reviewer", "operator", "admin"].includes(input.context.actorRole) && Boolean(input.context.reason?.trim());
  return evaluateGovernedActionPolicy(input.action, input.context).allowed;
}
