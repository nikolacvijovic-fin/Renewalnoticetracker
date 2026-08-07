import { createDomainEvent } from "@/lib/events/domain-event-bus";
import type { DomainEvent } from "@/lib/events/domain-event-types";
import type { GovernedActionRecord, GovernedActionTransition } from "@/lib/action-governance/action-types";

const EVENT_BY_TRANSITION: Record<GovernedActionTransition, DomainEvent["name"]> = {
  block: "action.blocked",
  mark_ready: "action.ready",
  approve: "action.approved",
  complete_manually: "action.completed_manually",
  dismiss: "action.dismissed",
  accept_risk: "action.risk_accepted",
  supersede: "action.superseded",
  reopen: "action.reopened"
};

export function createGovernedActionLifecycleEvent(input: {
  action: GovernedActionRecord;
  actorUserId?: string | null;
  transition: GovernedActionTransition;
  fromStatus?: GovernedActionRecord["status"] | null;
  occurredAt?: string;
  reasonCode?: string | null;
}): DomainEvent {
  return createDomainEvent({
    name: EVENT_BY_TRANSITION[input.transition],
    organizationId: input.action.organizationId,
    actorUserId: input.actorUserId ?? null,
    entityType: "governed_action",
    entityId: input.action.id,
    occurredAt: input.occurredAt,
    decisionId: input.action.decisionId,
    source: input.action.source,
    correlationKey: input.action.entityId ?? input.action.decisionId ?? input.action.id,
    metadata: {
      actionId: input.action.id,
      decisionId: input.action.decisionId,
      actionType: input.action.actionType,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.action.status,
      reasonCode: input.reasonCode ?? null,
      evidenceRefs: input.action.evidenceRefs.map((evidence) => ({
        code: evidence.code,
        source: evidence.source,
        entityType: evidence.entityType ?? null,
        entityId: evidence.entityId ?? null,
        fieldName: evidence.fieldName ?? null,
        confidence: evidence.confidence ?? null
      }))
    }
  });
}

export function createNoSendBoundaryEvent(input: {
  action: GovernedActionRecord;
  blocked: boolean;
  actorUserId?: string | null;
  occurredAt?: string;
}): DomainEvent {
  return createDomainEvent({
    name: input.blocked ? "action.no_send_boundary_blocked" : "action.no_send_boundary_checked",
    organizationId: input.action.organizationId,
    actorUserId: input.actorUserId ?? null,
    entityType: "governed_action",
    entityId: input.action.id,
    occurredAt: input.occurredAt,
    decisionId: input.action.decisionId,
    source: input.action.source,
    metadata: {
      actionId: input.action.id,
      actionType: input.action.actionType,
      manualOnly: true,
      manualOutsideNoticeControl: true,
      noticeControlSent: false
    }
  });
}
