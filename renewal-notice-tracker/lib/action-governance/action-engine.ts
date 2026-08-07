import { governedActionCandidatesFromDecisions } from "@/lib/action-governance/action-records";
import type { DecisionRecord } from "@/lib/decision-intelligence/decision-types";
import type { GovernedActionCandidate, GovernedActionRecord } from "@/lib/action-governance/action-types";

export type GovernedActionQueueSummary = {
  blockedActions: GovernedActionRecord[];
  readyActions: GovernedActionRecord[];
  approvalRequiredActions: GovernedActionRecord[];
  overdueActions: GovernedActionRecord[];
  criticalActions: GovernedActionRecord[];
  acceptedRiskActions: GovernedActionRecord[];
  completedManualActions: GovernedActionRecord[];
  noSendProtectedActions: GovernedActionRecord[];
  actionsByOwner: Array<{ ownerUserId: string | null; count: number; blockedCount: number; readyCount: number }>;
  actionsByEntityType: Array<{ entityType: string; count: number; blockedCount: number }>;
};

export function governedActionCandidatesFromDecisionRecords(decisions: DecisionRecord[]): GovernedActionCandidate[] {
  return governedActionCandidatesFromDecisions(decisions);
}

export function summarizeGovernedActionQueues(input: {
  actions: GovernedActionRecord[];
  now?: string;
}): GovernedActionQueueSummary {
  const now = new Date(input.now ?? new Date().toISOString()).getTime();
  const activeActions = input.actions.filter((action) => action.status !== "superseded" && action.status !== "dismissed");
  const ownerMap = new Map<string, GovernedActionRecord[]>();
  const entityMap = new Map<string, GovernedActionRecord[]>();

  for (const action of activeActions) {
    const ownerKey = action.ownerUserId ?? "__unassigned__";
    ownerMap.set(ownerKey, [...(ownerMap.get(ownerKey) ?? []), action]);
    entityMap.set(action.entityType, [...(entityMap.get(action.entityType) ?? []), action]);
  }

  return {
    blockedActions: activeActions.filter((action) => action.status === "blocked"),
    readyActions: activeActions.filter((action) => action.status === "ready"),
    approvalRequiredActions: activeActions.filter((action) => action.status === "proposed" || action.status === "blocked"),
    overdueActions: activeActions.filter((action) => action.dueAt ? new Date(action.dueAt).getTime() < now : false),
    criticalActions: activeActions.filter((action) => action.severity === "critical"),
    acceptedRiskActions: input.actions.filter((action) => action.status === "accepted_risk"),
    completedManualActions: input.actions.filter((action) => action.status === "completed_manually"),
    noSendProtectedActions: activeActions.filter((action) => Boolean(action.metadata.noSendBoundary)),
    actionsByOwner: Array.from(ownerMap.entries()).map(([ownerUserId, actions]) => ({
      ownerUserId: ownerUserId === "__unassigned__" ? null : ownerUserId,
      count: actions.length,
      blockedCount: actions.filter((action) => action.status === "blocked").length,
      readyCount: actions.filter((action) => action.status === "ready").length
    })),
    actionsByEntityType: Array.from(entityMap.entries()).map(([entityType, actions]) => ({
      entityType,
      count: actions.length,
      blockedCount: actions.filter((action) => action.status === "blocked").length
    }))
  };
}
