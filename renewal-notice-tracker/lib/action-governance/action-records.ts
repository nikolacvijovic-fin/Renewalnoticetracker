import { createHash } from "node:crypto";
import { sanitizeDomainEventMetadata } from "@/lib/events/domain-event-bus";
import type { DecisionRecord } from "@/lib/decision-intelligence/decision-types";
import type {
  GovernedActionCandidate,
  GovernedActionRecord,
  GovernedActionRequiredRole,
  GovernedActionType
} from "@/lib/action-governance/action-types";

function stableId(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "none").join("|"))
    .digest("hex")
    .slice(0, 32);
}

export function governedActionDedupeKey(input: Pick<GovernedActionRecord | GovernedActionCandidate, "organizationId" | "decisionId" | "entityType" | "entityId" | "actionType" | "source">) {
  return [
    input.organizationId,
    input.decisionId ?? "none",
    input.entityType,
    input.entityId ?? "none",
    input.actionType,
    input.source
  ].join(":");
}

export function governedActionSourceFingerprint(candidate: GovernedActionCandidate) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: candidate.title,
      summary: candidate.summary,
      severity: candidate.severity,
      trustStatus: candidate.trustStatus,
      requiredEvidence: candidate.requiredEvidence,
      evidenceRefs: candidate.evidenceRefs,
      metadata: sanitizeDomainEventMetadata(candidate.metadata)
    }))
    .digest("hex");
}

export function createGovernedActionRecord(
  candidate: GovernedActionCandidate,
  now = new Date().toISOString()
): GovernedActionRecord {
  const metadata = sanitizeDomainEventMetadata({
    ...(candidate.metadata ?? {}),
    sourceFingerprint: candidate.sourceFingerprint ?? governedActionSourceFingerprint(candidate)
  });
  return {
    ...candidate,
    id: stableId([governedActionDedupeKey(candidate), String(metadata.sourceFingerprint ?? now)]),
    status: candidate.status ?? (candidate.blockedReason ? "blocked" : "proposed"),
    approverUserId: null,
    approvedAt: null,
    completedByUserId: null,
    completedAt: null,
    supersededByActionId: null,
    createdAt: now,
    updatedAt: now,
    metadata
  };
}

function actionTypeForDecision(decision: DecisionRecord): GovernedActionType {
  const ruleId = decision.ruleId ?? decision.metadata.explanationCode;
  if (ruleId === "missing_notice_deadline") return "review_notice_deadline";
  if (ruleId === "metadata_conflict" || ruleId === "unresolved_trust_override") return "resolve_metadata_conflict";
  if (ruleId === "weak_evidence") return "accept_weak_evidence";
  if (ruleId === "duplicate_import_suspected") return "dismiss_duplicate_import";
  if (ruleId === "import_row_blocked") return "correct_import_row";
  if (ruleId === "untrusted_ai_extraction" || ruleId === "ai_fact_requires_review" || decision.source === "ai") return "review_ai_fact";
  if (ruleId === "missing_owner") return "assign_owner";
  if (ruleId === "critical_opt_out_window" || ruleId === "expired_opt_out_window" || ruleId === "auto_renewal") return "record_manual_opt_out_decision";
  if (decision.decisionType === "risk_segment") return "resolve_risk_finding";
  return "update_next_action";
}

function requiredRoleForAction(actionType: GovernedActionType): GovernedActionRequiredRole {
  if (actionType === "accept_renewal_risk") return "operator";
  if (actionType === "mark_notice_sent_manually" || actionType === "record_vendor_reply") return "operator";
  if (actionType === "activate_import_row") return "operator";
  if (actionType === "assign_owner") return "operator";
  if (actionType === "resolve_metadata_conflict" || actionType === "review_ai_fact" || actionType === "accept_weak_evidence") return "reviewer";
  return "owner";
}

export function governedActionCandidateFromDecision(decision: DecisionRecord): GovernedActionCandidate {
  const actionType = actionTypeForDecision(decision);
  const requiredEvidence = actionType === "mark_notice_sent_manually"
    ? [{ code: "manual_outside_noticecontrol_confirmation", label: "Confirm human action outside NoticeControl", required: true }]
    : decision.trustStatus === "blocked" || decision.trustStatus === "weak" || decision.trustStatus === "conflicted"
      ? [{ code: "review_reason", label: "Human-readable review reason", required: actionType !== "assign_owner" }]
      : [];
  return {
    organizationId: decision.organizationId,
    decisionId: decision.id,
    entityType: decision.entityType,
    entityId: decision.entityId,
    actionType,
    title: decision.title,
    summary: decision.summary,
    status: decision.status === "open" && decision.blockedReason ? "blocked" : "proposed",
    source: "decision",
    severity: decision.severity,
    trustStatus: decision.trustStatus,
    requiredRole: requiredRoleForAction(actionType),
    ownerUserId: decision.ownerUserId,
    dueAt: decision.dueAt,
    blockedReason: decision.blockedReason,
    requiredEvidence,
    evidenceRefs: decision.evidenceRefs,
    allowedTransitions: [
      "mark_ready",
      "approve",
      "complete_manually",
      "dismiss",
      "accept_risk",
      "supersede",
      "reopen"
    ],
    metadata: {
      decisionType: decision.decisionType,
      ruleId: decision.ruleId,
      noSendBoundary: actionType === "mark_notice_sent_manually" || actionType === "record_vendor_reply" || actionType === "record_manual_opt_out_decision"
    }
  };
}

export function governedActionCandidatesFromDecisions(decisions: DecisionRecord[]) {
  return decisions
    .filter((decision) => decision.status === "open" || decision.status === "acknowledged")
    .map((decision) => governedActionCandidateFromDecision(decision));
}
