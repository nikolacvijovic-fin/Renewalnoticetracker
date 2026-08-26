import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  getAdminActiveCommercialDecisionByContractId,
  listAdminCommercialDecisionApprovalSteps,
  listAdminCommercialDecisionEvidenceLinks
} from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";
import {
  getAdminLatestEvidenceReadinessAssessment,
  listAdminEvidenceReadinessAssessments,
  loadAdminFounderEvidenceReadinessSources,
  loadAdminEvidenceReadinessSources,
  persistAdminEvidenceReadinessAssessment
} from "@/lib/evidence-readiness/repositories/admin-evidence-readiness-repository";
import { buildEvidenceReadinessFacts, decisionProfileFromDecision } from "@/lib/evidence-readiness/runtime";
import { calculateEvidenceReadiness } from "@/lib/evidence-readiness/score";
import { EVIDENCE_CATEGORIES, type EvidenceDecisionProfile, type EvidenceReadinessAssessment, type EvidenceReadinessItem } from "@/lib/evidence-readiness/types";
import { buildFounderEvidenceReadinessSummary } from "@/lib/evidence-readiness/founder-summary";
import { resolveContractUsageEvidence, type UsageEvidenceCandidate } from "@/lib/evidence-readiness/usage-provenance";
import { classifySubscriptionFindingLifecycle, isReviewedSubscriptionFinding } from "@/lib/subscription-usage/finding-lifecycle";
import { summarizeEvidenceWarnings } from "@/lib/subscription-usage/warning-classification";

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return firstRecord(value[0]);
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string").slice(0, 20) : [];
}

function usageCandidates(input: {
  organizationId: string;
  contractId: string;
  matches: Array<Record<string, unknown>>;
  batches: Array<Record<string, unknown>>;
  syncRuns: Array<Record<string, unknown>>;
}): UsageEvidenceCandidate[] {
  return input.matches.map((match) => {
    const row = firstRecord(match.usage_import_rows) ?? {};
    const batchId = stringValue(row.batch_id) ?? "";
    const batch = input.batches.find((entry) => entry.id === batchId) ?? {};
    const rowSyncRunId = stringValue(row.sync_run_id);
    const batchSyncRunId = stringValue(batch.sync_run_id);
    const syncRunId = rowSyncRunId ?? batchSyncRunId;
    const syncRun = input.syncRuns.find((entry) => entry.id === syncRunId) ?? {};
    const rowConnectionId = stringValue(row.provider_connection_id);
    const batchConnectionId = stringValue(batch.provider_connection_id);
    const runConnectionId = stringValue(syncRun.provider_connection_id);
    const providers = [stringValue(row.provider), stringValue(batch.provider), stringValue(syncRun.provider)].filter(Boolean);
    return {
      organizationId: stringValue(match.organization_id) ?? "",
      contractId: stringValue(match.contract_id) ?? "",
      matchId: stringValue(match.id) ?? "",
      matchConfidence: numberValue(match.match_confidence) ?? 0,
      matchStatus: stringValue(match.match_status),
      matchResolvedAt: stringValue(match.resolved_at),
      matchSupersededAt: stringValue(match.superseded_at),
      usageRowId: stringValue(row.id) ?? stringValue(match.usage_row_id) ?? "",
      usageRowOrganizationId: stringValue(row.organization_id) ?? "",
      batchId,
      batchOrganizationId: stringValue(batch.organization_id) ?? "",
      batchStatus: stringValue(batch.status) ?? "",
      provider: stringValue(row.provider) ?? stringValue(batch.provider) ?? stringValue(syncRun.provider),
      providerConnectionId: stringValue(row.provider_connection_id) ?? stringValue(batch.provider_connection_id) ?? stringValue(syncRun.provider_connection_id),
      syncRunId,
      syncRunOrganizationId: stringValue(syncRun.organization_id),
      syncRunStatus: stringValue(syncRun.status),
      syncCompletedAt: stringValue(syncRun.completed_at),
      collectedAt: stringValue(row.collected_at),
      isSample: row.is_sample === true,
      evidenceState: stringValue(row.evidence_state),
      validationStatus: stringValue(row.validation_status),
      purchasedQuantityKnown: numberValue(row.purchased_seats ?? row.seats_purchased) !== null,
      assignedQuantityKnown: numberValue(row.assigned_seats ?? row.seats_used) !== null,
      warningCodes: stringArray(row.warning_codes)
      ,lineageValid: Boolean(
        batchId
        && batchSyncRunId
        && syncRunId === batchSyncRunId
        && (!rowSyncRunId || rowSyncRunId === batchSyncRunId)
        && batchConnectionId
        && runConnectionId === batchConnectionId
        && (!rowConnectionId || rowConnectionId === batchConnectionId)
        && providers.length
        && providers.every((provider) => provider === providers[0])
      )
    };
  });
}

export async function recalculateEvidenceReadiness(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
  decisionProfile?: EvidenceDecisionProfile;
  now?: string;
  trigger?: string;
}) {
  const decisionResult = await getAdminActiveCommercialDecisionByContractId({
    organizationId: input.organizationId,
    contractId: input.contractId
  });
  if (decisionResult.error) throw decisionResult.error;
  const decision = decisionResult.data;
  const [evidenceResult, approvalResult] = decision ? await Promise.all([
    listAdminCommercialDecisionEvidenceLinks({ organizationId: input.organizationId, decisionId: decision.id }),
    listAdminCommercialDecisionApprovalSteps({ organizationId: input.organizationId, decisionId: decision.id })
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (evidenceResult.error) throw evidenceResult.error;
  if (approvalResult.error) throw approvalResult.error;
  const sources = await loadAdminEvidenceReadinessSources({
    organizationId: input.organizationId,
    contractId: input.contractId,
    decisionId: decision?.id ?? null
  });
  const contract = sources.contract;
  const ownerId = stringValue(contract.owner_user_id);
  const owner = sources.members.find((member) => member.user_id === ownerId);
  const ownerUser = firstRecord(owner?.users);
  const usageResolution = resolveContractUsageEvidence({
    organizationId: input.organizationId,
    contractId: input.contractId,
    candidates: usageCandidates({
      organizationId: input.organizationId,
      contractId: input.contractId,
      matches: sources.matches,
      batches: sources.batches,
      syncRuns: sources.syncRuns
    })
  });
  const usage = usageResolution.provenance;
  const quote = sources.quotes[0];
  const reviewedQuoteFindings = sources.quoteFindings.filter((entry) => ["reviewed", "accepted", "dismissed"].includes(String(entry.status)));
  const activeFindings = sources.findings.filter((finding) => !["resolved", "superseded"].includes(classifySubscriptionFindingLifecycle({
    reviewStatus: stringValue(finding.review_status),
    resolvedAt: stringValue(finding.resolved_at),
    supersededAt: stringValue(finding.superseded_at)
  })));
  const usageWarnings = summarizeEvidenceWarnings(usage?.warningCodes ?? []);
  const profile = input.decisionProfile ?? decisionProfileFromDecision(decision);

  const facts = buildEvidenceReadinessFacts({
    contract: contract as never,
    decision,
    evidenceLinks: evidenceResult.data ?? [],
    approvalSteps: approvalResult.data ?? [],
    ownerNotificationEmail: stringValue(ownerUser?.notification_email),
    workspaceTimezoneConfigured: Boolean(sources.organizationTimezone),
    organizationTimezone: sources.organizationTimezone,
    usage: {
      resolutionState: usageResolution.state,
      provider: usage?.provider ?? null,
      connectionId: usage?.providerConnectionId ?? null,
      batchId: usage?.batchId ?? null,
      syncRunId: usage?.syncRunId ?? null,
      usageRowId: usage?.usageRowId ?? null,
      connected: Boolean(usage),
      snapshotCollectedAt: usage?.collectedAt ?? null,
      syncCompletedAt: usage?.syncCompletedAt ?? null,
      matchId: usage?.matchId ?? null,
      matchConfidence: usage?.matchConfidence ?? null,
      purchasedQuantityKnown: usage?.purchasedQuantityKnown ?? false,
      assignedQuantityKnown: usage?.assignedQuantityKnown ?? false,
      hasActiveConflict: usageWarnings.hasConflict,
      activeMaterialFindingCount: activeFindings.length,
      reviewedMaterialFindingCount: activeFindings.filter((finding) => isReviewedSubscriptionFinding({
        reviewStatus: stringValue(finding.review_status),
        resolvedAt: stringValue(finding.resolved_at),
        supersededAt: stringValue(finding.superseded_at)
      })).length,
      materialFindingSourceId: stringValue(activeFindings[0]?.id)
    },
    quote: {
      comparisonId: stringValue(quote?.id),
      uploaded: Boolean(quote?.id && quote?.quote_file_id),
      reviewed: quote?.status === "reviewed",
      reviewedAt: stringValue(quote?.quote_reviewed_at),
      priceVerified: quote?.status === "reviewed" && numberValue(quote?.proposed_total_amount) !== null,
      currency: stringValue(quote?.currency),
      materialChangeCount: sources.quoteFindings.length,
      reviewedMaterialChangeCount: reviewedQuoteFindings.length
    },
    openEvidenceRequestCount: sources.openEvidenceTasks.length,
    preferredScenarioExchangeRateSource: stringValue(sources.preferredScenarios[0]?.exchange_rate_source),
    now: input.now
  });
  const assessment = calculateEvidenceReadiness({
    organizationId: input.organizationId,
    contractId: input.contractId,
    decisionProfile: profile,
    facts,
    calculatedAt: input.now
  });
  const recalculationTrigger = input.trigger?.match(/^[a-z][a-z0-9_]{0,63}$/)
    ? input.trigger
    : "unspecified_event";
  const metadata = Array.isArray(contract.contract_metadata)
    ? contract.contract_metadata[0]
    : contract.contract_metadata;
  const deadlineTimezone = stringValue((metadata as Record<string, unknown> | null)?.deadline_timezone)
    ?? sources.organizationTimezone;
  const persisted = await persistAdminEvidenceReadinessAssessment(assessment, recalculationTrigger, deadlineTimezone);
  if (persisted.error) throw persisted.error;

  if (persisted.data?.changed) {
    await recordEnterpriseAuditEvent({
      organizationId: input.organizationId,
      contractId: input.contractId,
      actorUserId: input.actorUserId ?? null,
      eventType: "evidence.readiness_recalculated",
      eventCategory: "evidence",
      eventSource: "evidence_readiness",
      severity: assessment.readinessState === "blocked" ? "warning" : "info",
      metadata: {
        contractId: input.contractId,
        assessmentId: persisted.data.assessmentId,
        decisionProfile: assessment.decisionProfile,
        score: assessment.score,
        readinessState: assessment.readinessState,
        criticalBlockerCount: assessment.criticalBlockers.length,
        calculationVersion: assessment.calculationVersion,
        evidenceHashPrefix: assessment.evidenceHash.slice(0, 12)
        ,recalculationTrigger
      },
      mode: "best_effort"
    });
  }
  return { assessment, persistence: persisted.data };
}

function persistedAssessment(row: Record<string, unknown>): EvidenceReadinessAssessment {
  const items = (Array.isArray(row.evidence_readiness_items) ? row.evidence_readiness_items : []).map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      requirementKey: String(item.requirement_key), label: String(item.label), category: String(item.category),
      state: String(item.state), weight: Number(item.weight), earnedWeight: Number(item.earned_weight),
      critical: item.is_critical === true, evidenceSource: stringValue(item.evidence_source),
      sourceRecordId: stringValue(item.source_record_id), verifiedBy: stringValue(item.verified_by_user_id),
      verifiedAt: stringValue(item.verified_at), freshnessDate: stringValue(item.freshness_date),
      provenance: item.provenance && typeof item.provenance === "object" ? item.provenance : null,
      explanation: String(item.explanation), recommendedAction: String(item.recommended_action),
      calculationVersion: String(item.calculation_version)
    } as EvidenceReadinessItem;
  });
  const blockers = items.filter((item) => item.critical && ["missing", "stale", "conflicting", "insufficient"].includes(item.state));
  const categories = EVIDENCE_CATEGORIES.map((category) => {
    const categoryItems = items.filter((item) => item.category === category && item.state !== "not_applicable");
    const total = categoryItems.reduce((sum, item) => sum + item.weight, 0);
    const earned = categoryItems.reduce((sum, item) => sum + item.earnedWeight, 0);
    return { category, score: total ? Math.round((earned / total) * 100) : 100, earnedWeight: earned, applicableWeight: total, blockerCount: categoryItems.filter((item) => blockers.includes(item)).length };
  });
  return {
    organizationId: String(row.organization_id), contractId: String(row.contract_id),
    decisionProfile: String(row.decision_profile) as EvidenceDecisionProfile,
    score: Number(row.score), readinessState: String(row.readiness_state) as EvidenceReadinessAssessment["readinessState"],
    items, categories, criticalBlockers: blockers,
    missingEvidence: items.filter((item) => item.state === "missing"),
    staleEvidence: items.filter((item) => item.state === "stale"),
    conflictingEvidence: items.filter((item) => item.state === "conflicting"),
    verifiedEvidence: items.filter((item) => item.state === "verified"),
    nextRecommendedAction: String(row.next_recommended_action), evidenceHash: String(row.evidence_hash),
    materialEvidenceHash: String(row.material_evidence_hash ?? row.evidence_hash),
    calculatedAt: String(row.calculated_at), calculationVersion: String(row.calculation_version)
  };
}

export async function getLatestEvidenceReadiness(input: {
  organizationId: string;
  contractId: string;
  decisionProfile?: EvidenceDecisionProfile | null;
}) {
  const result = await getAdminLatestEvidenceReadinessAssessment(input);
  if (result.error) throw result.error;
  return result.data ? persistedAssessment(result.data) : null;
}

export async function listEvidenceReadinessPortfolio(input: { organizationId: string; limit?: number }) {
  const result = await listAdminEvidenceReadinessAssessments(input);
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function getFounderEvidenceReadinessSummary(input: {
  organizationIds: string[];
  now?: string;
}) {
  const sources = await loadAdminFounderEvidenceReadinessSources({ organizationIds: input.organizationIds });
  return buildFounderEvidenceReadinessSummary({ ...sources, now: input.now });
}
