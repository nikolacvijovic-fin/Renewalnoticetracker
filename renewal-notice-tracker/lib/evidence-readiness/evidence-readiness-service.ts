import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import {
  getAdminActiveCommercialDecisionByContractId,
  listAdminCommercialDecisionApprovalSteps,
  listAdminCommercialDecisionEvidenceLinks
} from "@/lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository";
import {
  listAdminEvidenceReadinessAssessments,
  loadAdminFounderEvidenceReadinessSources,
  loadAdminEvidenceReadinessSources,
  persistAdminEvidenceReadinessAssessment
} from "@/lib/evidence-readiness/repositories/admin-evidence-readiness-repository";
import { buildEvidenceReadinessFacts, decisionProfileFromDecision } from "@/lib/evidence-readiness/runtime";
import { calculateEvidenceReadiness } from "@/lib/evidence-readiness/score";
import type { EvidenceDecisionProfile } from "@/lib/evidence-readiness/types";
import { buildFounderEvidenceReadinessSummary } from "@/lib/evidence-readiness/founder-summary";

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

export async function recalculateEvidenceReadiness(input: {
  organizationId: string;
  contractId: string;
  actorUserId?: string | null;
  decisionProfile?: EvidenceDecisionProfile;
  now?: string;
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
  const connection = sources.connections.find((entry) => entry.status === "connected") ?? sources.connections[0];
  const match = sources.matches.find((entry) => {
    const usageRow = firstRecord(entry.usage_import_rows);
    return !usageRow?.is_sample;
  });
  const usageRow = firstRecord(match?.usage_import_rows);
  const quote = sources.quotes[0];
  const reviewedQuoteFindings = sources.quoteFindings.filter((entry) => ["reviewed", "accepted", "dismissed"].includes(String(entry.status)));
  const profile = input.decisionProfile ?? decisionProfileFromDecision(decision);

  const facts = buildEvidenceReadinessFacts({
    contract: contract as never,
    decision,
    evidenceLinks: evidenceResult.data ?? [],
    approvalSteps: approvalResult.data ?? [],
    ownerNotificationEmail: stringValue(ownerUser?.notification_email),
    workspaceTimezoneConfigured: sources.workspaceTimezoneConfigured,
    usage: {
      connectionId: stringValue(connection?.id),
      connected: connection?.status === "connected",
      lastSuccessfulSyncAt: stringValue(connection?.last_successful_sync_at),
      matchId: stringValue(match?.id),
      matchConfidence: numberValue(match?.match_confidence),
      purchasedQuantityKnown: numberValue(usageRow?.purchased_seats ?? usageRow?.seats_purchased) !== null,
      assignedQuantityKnown: numberValue(usageRow?.assigned_seats ?? usageRow?.seats_used) !== null,
      hasActiveConflict: sources.findings.some((finding) => Array.isArray(finding.warnings) && finding.warnings.length > 0),
      activeMaterialFindingCount: sources.findings.length,
      reviewedMaterialFindingCount: sources.findings.filter((finding) => ["accepted", "dismissed", "reviewed"].includes(String(finding.review_status))).length,
      materialFindingSourceId: stringValue(sources.findings[0]?.id)
    },
    quote: {
      comparisonId: stringValue(quote?.id),
      uploaded: Boolean(quote?.id && quote?.quote_file_id),
      reviewed: quote?.status === "reviewed",
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
  const persisted = await persistAdminEvidenceReadinessAssessment(assessment);
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
      },
      mode: "best_effort"
    });
  }
  return { assessment, persistence: persisted.data };
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
