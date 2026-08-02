import { sanitizeDomainEventMetadata } from "@/lib/events/domain-event-bus";
import { determineAiFactTrustStatus } from "@/lib/ai/ai-trust-policy";
import type { AiProposedFactInput, NormalizedAiFact } from "@/lib/ai/unified-ai-types";
import type { DecisionCandidate } from "@/lib/decision-intelligence/decision-types";

export function normalizeAiProposedFact(input: AiProposedFactInput): NormalizedAiFact {
  const reviewStatus = input.reviewStatus ?? "proposed";
  const confidence = Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0;
  const trustStatus = determineAiFactTrustStatus({
    field: input.field,
    confidence,
    evidenceReferencePresent: Boolean(input.evidenceReference?.sourceLabel),
    reviewStatus
  });

  return {
    id: input.id ?? null,
    organizationId: input.organizationId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    field: input.field,
    fieldName: input.field,
    value: input.value,
    proposedValue: input.value,
    source: input.source,
    extractionSource: input.source,
    confidence,
    evidenceReference: input.evidenceReference
      ? {
          sourceLabel: input.evidenceReference.sourceLabel,
          sourceId: input.evidenceReference.sourceId ?? null,
          excerptHash: input.evidenceReference.excerptHash ?? null
      }
      : null,
    evidenceRef: input.evidenceReference
      ? {
          sourceLabel: input.evidenceReference.sourceLabel,
          sourceId: input.evidenceReference.sourceId ?? null,
          excerptHash: input.evidenceReference.excerptHash ?? null
        }
      : null,
    reviewStatus,
    trustStatus,
    requiresReview: trustStatus === "needs_review",
    reviewedByUserId: null,
    reviewedAt: null,
    reviewReason: null,
    createdAt: new Date().toISOString(),
    metadata: sanitizeDomainEventMetadata({
      fieldName: input.field,
      extractionSource: input.source
    }) as Record<string, string | number | boolean | null>
  };
}

export function normalizeAiProposedFacts(inputs: AiProposedFactInput[]) {
  return inputs.map(normalizeAiProposedFact);
}

export function aiFactDecisionCandidate(fact: NormalizedAiFact): DecisionCandidate | null {
  if (!fact.organizationId || !fact.requiresReview) return null;
  return {
    organizationId: fact.organizationId,
    entityType: fact.entityType ?? "ai_fact",
    entityId: fact.entityId ?? fact.id,
    decisionType: "blocker",
    title: `${fact.fieldName.replaceAll("_", " ")} requires review`,
    summary: "AI-derived critical renewal facts remain proposed until a human reviewer accepts the evidence.",
    severity: fact.confidence < 0.75 ? "high" : "medium",
    source: "ai",
    ruleId: "ai_fact_requires_review",
    aiFactId: fact.id,
    confidence: fact.confidence,
    trustStatus: "proposed",
    evidenceRefs: [
      {
        code: "ai_fact_requires_review",
        source: "ai_proposed_fact",
        entityType: fact.entityType,
        entityId: fact.entityId,
        fieldName: fact.fieldName,
        confidence: fact.confidence,
        value: typeof fact.proposedValue === "string" || typeof fact.proposedValue === "number" || typeof fact.proposedValue === "boolean"
          ? fact.proposedValue
          : null
      }
    ],
    allowedActions: ["review_evidence", "acknowledge"],
    blockedReason: "AI proposed fact has not been accepted by a human reviewer.",
    ownerUserId: null,
    dueAt: null,
    metadata: {
      evidenceSourceLabel: fact.evidenceRef?.sourceLabel ?? null,
      extractionSource: fact.extractionSource
    }
  };
}
