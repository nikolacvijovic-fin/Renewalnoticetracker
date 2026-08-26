import { createHash } from "node:crypto";
import {
  EVIDENCE_READINESS_CALCULATION_VERSION,
  EVIDENCE_READINESS_DECISION_THRESHOLD,
  EVIDENCE_REQUIREMENT_CONFIG,
  EVIDENCE_STATE_CREDIT
} from "@/lib/evidence-readiness/config";
import {
  EVIDENCE_CATEGORIES,
  type EvidenceDecisionProfile,
  type EvidenceReadinessAssessment,
  type EvidenceReadinessFacts,
  type EvidenceReadinessItem,
  type EvidenceRequirementState
} from "@/lib/evidence-readiness/types";

const BLOCKER_STATES = new Set<EvidenceRequirementState>(["missing", "stale", "conflicting", "insufficient"]);
const SAFE_TEXT_PATTERN = /(raw contract|full contract|ocr output|provider payload|bearer\s|secret|token|storage path|private note)/i;

function safeText(value: string | undefined, fallback: string) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized || SAFE_TEXT_PATTERN.test(normalized)) return fallback;
  return normalized.slice(0, 300);
}

function profileRule(profile: EvidenceDecisionProfile, definition: (typeof EVIDENCE_REQUIREMENT_CONFIG)[number]) {
  const rule = definition.profiles?.[profile];
  return {
    applicable: rule?.applicable !== false,
    critical: rule?.critical ?? definition.criticalByDefault
  };
}

function canonicalHash(profile: EvidenceDecisionProfile, items: EvidenceReadinessItem[]) {
  return createHash("sha256").update(JSON.stringify({
    calculationVersion: EVIDENCE_READINESS_CALCULATION_VERSION,
    profile,
    items: items.map((item) => ({
      key: item.requirementKey,
      state: item.state,
      critical: item.critical,
      source: item.evidenceSource,
      sourceRecordId: item.sourceRecordId,
      verifiedAt: item.verifiedAt,
      freshnessDate: item.freshnessDate,
      provenance: item.provenance
    }))
  })).digest("hex");
}

export function calculateEvidenceReadiness(input: {
  organizationId: string;
  contractId: string;
  decisionProfile: EvidenceDecisionProfile;
  facts: EvidenceReadinessFacts;
  calculatedAt?: string;
}): EvidenceReadinessAssessment {
  const calculatedAt = input.calculatedAt ?? new Date().toISOString();
  const items = EVIDENCE_REQUIREMENT_CONFIG.map<EvidenceReadinessItem>((definition) => {
    const rule = profileRule(input.decisionProfile, definition);
    const observation = input.facts[definition.key];
    const state = rule.applicable ? observation?.state ?? "missing" : "not_applicable";
    const source = state === "verified" || state === "present_unreviewed" ? observation?.source ?? null : observation?.source ?? null;
    return {
      requirementKey: definition.key,
      label: definition.label,
      category: definition.category,
      state,
      weight: definition.weight,
      earnedWeight: state === "not_applicable" ? 0 : definition.weight * EVIDENCE_STATE_CREDIT[state],
      critical: rule.applicable && rule.critical,
      evidenceSource: source?.sourceType ?? null,
      sourceRecordId: source?.sourceRecordId ?? null,
      verifiedBy: source?.verifiedBy ?? null,
      verifiedAt: source?.verifiedAt ?? null,
      freshnessDate: source?.freshnessDate ?? null,
      provenance: source?.provenance ?? null,
      explanation: safeText(observation?.explanation, state === "not_applicable" ? "Not required for this decision profile." : `${definition.label} is ${state.replaceAll("_", " ")}.`),
      recommendedAction: safeText(observation?.recommendedAction, definition.defaultAction),
      calculationVersion: EVIDENCE_READINESS_CALCULATION_VERSION
    };
  });

  const applicable = items.filter((item) => item.state !== "not_applicable");
  const applicableWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
  const earnedWeight = applicable.reduce((sum, item) => sum + item.earnedWeight, 0);
  const score = applicableWeight ? Math.round((earnedWeight / applicableWeight) * 100) : 0;
  const criticalBlockers = applicable.filter((item) => item.critical && BLOCKER_STATES.has(item.state));
  const unreviewed = applicable.filter((item) => item.state === "present_unreviewed");
  const incompleteImportant = applicable.filter((item) => !item.critical && BLOCKER_STATES.has(item.state));

  const readinessState = criticalBlockers.length
    ? "blocked"
    : incompleteImportant.length || score < 70
        ? "incomplete"
        : unreviewed.length || score < EVIDENCE_READINESS_DECISION_THRESHOLD
          ? "review_required"
          : "decision_ready";

  const actionItem = criticalBlockers[0] ?? incompleteImportant[0] ?? unreviewed[0] ?? applicable.find((item) => item.state !== "verified");
  const categories = EVIDENCE_CATEGORIES.map((category) => {
    const categoryItems = applicable.filter((item) => item.category === category);
    const total = categoryItems.reduce((sum, item) => sum + item.weight, 0);
    const earned = categoryItems.reduce((sum, item) => sum + item.earnedWeight, 0);
    return {
      category,
      score: total ? Math.round((earned / total) * 100) : 100,
      earnedWeight: Number(earned.toFixed(2)),
      applicableWeight: total,
      blockerCount: categoryItems.filter((item) => item.critical && BLOCKER_STATES.has(item.state)).length
    };
  });

  return {
    organizationId: input.organizationId,
    contractId: input.contractId,
    decisionProfile: input.decisionProfile,
    score,
    readinessState,
    items,
    categories,
    criticalBlockers,
    missingEvidence: applicable.filter((item) => item.state === "missing"),
    staleEvidence: applicable.filter((item) => item.state === "stale"),
    conflictingEvidence: applicable.filter((item) => item.state === "conflicting"),
    verifiedEvidence: applicable.filter((item) => item.state === "verified"),
    nextRecommendedAction: actionItem?.recommendedAction ?? "Evidence is ready for a responsible human decision.",
    evidenceHash: canonicalHash(input.decisionProfile, items),
    materialEvidenceHash: canonicalHash(
      input.decisionProfile,
      items.filter((item) => item.category !== "decision_approval")
    ),
    calculatedAt,
    calculationVersion: EVIDENCE_READINESS_CALCULATION_VERSION
  };
}
