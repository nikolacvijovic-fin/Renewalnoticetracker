import { createDomainEvent } from "@/lib/events/domain-event-bus";
import type { DomainEvent } from "@/lib/events/domain-event-types";
import type {
  DecisionActorRole,
  DecisionLifecycleInput,
  DecisionRecord
} from "@/lib/decision-intelligence/decision-types";

const READ_ROLES = new Set<DecisionActorRole>(["viewer", "member", "owner", "reviewer", "operator", "admin"]);
const REVIEW_ROLES = new Set<DecisionActorRole>(["reviewer", "operator", "admin"]);
const OPERATE_ROLES = new Set<DecisionActorRole>(["operator", "admin"]);
const ADMIN_ROLES = new Set<DecisionActorRole>(["admin"]);

export function canReadDecision(role: DecisionActorRole) {
  return READ_ROLES.has(role);
}

export function canMutateDecision(input: {
  decision: DecisionRecord;
  action: DecisionLifecycleInput["action"];
  actorRole: DecisionActorRole;
  actorUserId: string;
  linkedOwnerUserId?: string | null;
}) {
  if (ADMIN_ROLES.has(input.actorRole)) return true;
  const isLinkedOwner =
    input.actorRole === "owner" &&
    Boolean(input.linkedOwnerUserId) &&
    input.linkedOwnerUserId === input.actorUserId &&
    input.decision.ownerUserId === input.actorUserId;

  if (input.action === "acknowledge") {
    return REVIEW_ROLES.has(input.actorRole) || isLinkedOwner;
  }
  if (input.action === "resolve") {
    return OPERATE_ROLES.has(input.actorRole) ||
      (input.decision.decisionType === "trust_gap" && REVIEW_ROLES.has(input.actorRole)) ||
      isLinkedOwner;
  }
  if (input.action === "accept_risk" || input.action === "dismiss") {
    return ADMIN_ROLES.has(input.actorRole);
  }
  if (input.action === "reopen") {
    return REVIEW_ROLES.has(input.actorRole) || isLinkedOwner;
  }
  if (input.action === "supersede") {
    return OPERATE_ROLES.has(input.actorRole);
  }
  return false;
}

function requiresReason(action: DecisionLifecycleInput["action"]) {
  return action === "accept_risk" || action === "dismiss" || action === "resolve" || action === "supersede";
}

export function applyDecisionLifecycleAction(
  decision: DecisionRecord,
  input: DecisionLifecycleInput
): { decision: DecisionRecord; event: DomainEvent } {
  if (!canMutateDecision({
    decision,
    action: input.action,
    actorRole: input.actorRole,
    actorUserId: input.actorUserId,
    linkedOwnerUserId: input.linkedOwnerUserId
  })) {
    throw new Error("Actor is not allowed to mutate this decision.");
  }
  if (requiresReason(input.action) && !input.reason?.trim()) {
    throw new Error("Decision lifecycle action requires a human-readable reason.");
  }
  const now = input.now ?? new Date().toISOString();
  const next: DecisionRecord = {
    ...decision,
    status:
      input.action === "acknowledge" ? "acknowledged" :
      input.action === "accept_risk" ? "accepted_risk" :
      input.action === "reopen" ? "open" :
      input.action === "supersede" ? "superseded" :
      input.action === "dismiss" ? "dismissed" :
      "resolved",
    resolvedAt: input.action === "reopen" ? null : now,
    resolvedByUserId: input.action === "reopen" ? null : input.actorUserId,
    updatedAt: now,
    supersededByDecisionId: input.action === "supersede" ? input.supersededByDecisionId ?? null : decision.supersededByDecisionId,
    metadata: {
      ...decision.metadata,
      lastLifecycleReason: input.reason?.trim() ?? null
    }
  };
  const eventName =
    input.action === "acknowledge" ? "decision.acknowledged" :
    input.action === "accept_risk" ? "decision.risk_accepted" :
    input.action === "reopen" ? "decision.reopened" :
    input.action === "supersede" ? "decision.superseded" :
    input.action === "dismiss" ? "decision.dismissed" :
    "decision.resolved";

  return {
    decision: next,
    event: createDomainEvent({
      name: eventName,
      organizationId: decision.organizationId,
      actorUserId: input.actorUserId,
      entityType: "decision_record",
      entityId: decision.id,
      occurredAt: now,
      decisionId: decision.id,
      ruleId: decision.ruleId,
      source: decision.source,
      metadata: {
        decisionType: decision.decisionType,
        fromStatus: decision.status,
        toStatus: next.status,
        reason: input.reason ?? null
      }
    })
  };
}
