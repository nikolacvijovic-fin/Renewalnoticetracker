import { createHash } from "node:crypto";
import { sanitizeDomainEventMetadata } from "@/lib/events/domain-event-bus";
import type { RuleOutcome } from "@/lib/rules/rule-types";
import type {
  DecisionCandidate,
  DecisionEvidenceRef,
  DecisionRecord,
  DecisionTrustStatus,
  DecisionType
} from "@/lib/decision-intelligence/decision-types";

function stableId(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(parts.map((part) => part ?? "none").join("|"))
    .digest("hex")
    .slice(0, 32);
}

export function decisionDedupeKey(input: Pick<DecisionRecord | DecisionCandidate, "organizationId" | "entityType" | "entityId" | "decisionType" | "source" | "ruleId" | "aiFactId">) {
  return [
    input.organizationId,
    input.entityType,
    input.entityId ?? "none",
    input.decisionType,
    input.source,
    input.ruleId ?? input.aiFactId ?? "manual"
  ].join(":");
}

export function decisionSourceFingerprint(candidate: DecisionCandidate) {
  return createHash("sha256")
    .update(JSON.stringify({
      title: candidate.title,
      summary: candidate.summary,
      severity: candidate.severity,
      trustStatus: candidate.trustStatus,
      evidenceRefs: candidate.evidenceRefs,
      metadata: sanitizeDomainEventMetadata(candidate.metadata)
    }))
    .digest("hex");
}

export function createDecisionRecord(candidate: DecisionCandidate, now = new Date().toISOString()): DecisionRecord {
  const metadata = sanitizeDomainEventMetadata({
    ...(candidate.metadata ?? {}),
    sourceFingerprint: candidate.sourceFingerprint ?? decisionSourceFingerprint(candidate)
  });
  return {
    ...candidate,
    id: stableId([
      decisionDedupeKey(candidate),
      String(metadata.sourceFingerprint ?? now)
    ]),
    status: "open",
    resolvedAt: null,
    resolvedByUserId: null,
    createdAt: now,
    updatedAt: now,
    supersededByDecisionId: null,
    metadata
  };
}

function decisionTypeForOutcome(outcome: RuleOutcome): DecisionType {
  if (outcome.outcomeType === "blocker") return "blocker";
  if (outcome.outcomeType === "finding") return "finding";
  if (outcome.outcomeType === "next_action") return "next_action";
  return "recommendation";
}

function trustStatusForOutcome(outcome: RuleOutcome): DecisionTrustStatus {
  if (["metadata_conflict", "unresolved_trust_override"].includes(outcome.code)) return "conflicted";
  if (["weak_evidence", "missing_notice_deadline", "untrusted_ai_extraction", "ai_fact_requires_review"].includes(outcome.code)) return "blocked";
  return outcome.severity === "info" ? "trusted" : "proposed";
}

export function decisionCandidateFromRuleOutcome(input: {
  organizationId: string;
  entityType: string;
  entityId?: string | null;
  outcome: RuleOutcome;
  ownerUserId?: string | null;
  dueAt?: string | null;
}): DecisionCandidate {
  const evidenceRefs: DecisionEvidenceRef[] = input.outcome.evidence.map((evidence) => ({
    code: evidence.code,
    source: evidence.source ?? "system_rule",
    fieldName: evidence.code,
    confidence: evidence.confidence ?? null,
    value: evidence.value ?? null
  }));
  const decisionType = decisionTypeForOutcome(input.outcome);
  return {
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    decisionType,
    title: input.outcome.code.replaceAll("_", " "),
    summary: input.outcome.message,
    severity: input.outcome.severity,
    source: "rule",
    ruleId: input.outcome.ruleId,
    aiFactId: null,
    confidence: evidenceRefs.find((evidence) => typeof evidence.confidence === "number")?.confidence ?? null,
    trustStatus: trustStatusForOutcome(input.outcome),
    evidenceRefs,
    allowedActions: decisionType === "blocker"
      ? ["review_evidence", "acknowledge", "resolve"]
      : ["acknowledge", "resolve", "open_source_record"],
    blockedReason: decisionType === "blocker" ? input.outcome.message : null,
    ownerUserId: input.ownerUserId ?? null,
    dueAt: input.dueAt ?? null,
    metadata: {
      recommendedAction: input.outcome.recommendedAction ?? null,
      explanationCode: input.outcome.code
    }
  };
}

export function decisionCandidatesFromRuleOutcomes(input: {
  organizationId: string;
  entityType: string;
  entityId?: string | null;
  outcomes: RuleOutcome[];
  ownerUserId?: string | null;
  dueAt?: string | null;
}) {
  return input.outcomes.map((outcome) => decisionCandidateFromRuleOutcome({
    organizationId: input.organizationId,
    entityType: input.entityType,
    entityId: input.entityId,
    outcome,
    ownerUserId: input.ownerUserId,
    dueAt: input.dueAt
  }));
}
