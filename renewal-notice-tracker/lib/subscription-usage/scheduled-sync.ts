import crypto from "node:crypto";
import { getBillingSnapshot } from "@/lib/billing/entitlements";
import { evaluateDesignPartnerBetaMutation, type DesignPartnerBetaControl } from "@/lib/billing/design-partner-beta";
import { fetchUsageInventorySnapshot } from "@/lib/add-ons/java-enterprise-client";
import { reconcileUsage, type ReconcileUsageResponse } from "@/lib/add-ons/python-intelligence-client";
import { getAppConfig } from "@/lib/config";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import {
  GOOGLE_WORKSPACE_REQUIRED_SCOPES,
  GOOGLE_WORKSPACE_USAGE_PROVIDER,
  mapGoogleWorkspaceSnapshotToImportRows,
  normalizeGoogleWorkspaceFailureCode,
  refreshGoogleWorkspaceAccessToken
} from "@/lib/subscription-usage/google-workspace";
import {
  acquireMicrosoft365ApplicationToken,
  mapMicrosoft365SnapshotToImportRows,
  MICROSOFT_365_USAGE_PROVIDER
} from "@/lib/subscription-usage/microsoft365";
import { getSubscriptionProviderCredential } from "@/lib/subscription-usage/repositories/admin-provider-credentials-repository";
import {
  claimDueSubscriptionUsageConnections,
  cleanupSubscriptionUsageConsentAttempts,
  completeScheduledSubscriptionUsageSync,
  createScheduledAnalysisScope,
  createScheduledSubscriptionUsageBatch,
  createScheduledSubscriptionUsageSyncRun,
  failScheduledSubscriptionUsageSync,
  getScheduledDesignPartnerBetaControl,
  loadScheduledAnalysisRows,
  loadScheduledContractCandidates,
  persistScheduledAnalysisFindings,
  releaseSkippedScheduledSubscriptionUsageClaim,
  type ClaimedSubscriptionUsageConnection
} from "@/lib/subscription-usage/repositories/admin-scheduled-sync-repository";
import { assessSubscriptionUsageRows, normalizeSubscriptionUsageEvidenceState } from "@/lib/subscription-usage/usage-import";
import { buildStableSubscriptionUsageFindingIdentity } from "@/lib/subscription-usage/finding-identity";
import { recalculateEvidenceReadiness } from "@/lib/evidence-readiness/evidence-readiness-service";

const MAX_ANALYSIS_ROWS = 10_000;
const PROVIDER_MIN_INTERVAL_MS = 250;
const nextProviderRequestAt = new Map<string, number>();

export type ScheduledSubscriptionUsageSummary = {
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
};

export async function processDueSubscriptionUsageConnections(input: {
  limit?: number;
  leaseMinutes?: number;
  concurrency?: number;
} = {}): Promise<ScheduledSubscriptionUsageSummary> {
  // Best-effort retention cleanup must never prevent provider synchronization.
  await cleanupSubscriptionUsageConsentAttempts().catch(() => null);
  const workerToken = crypto.randomUUID();
  const claimed = await claimDueSubscriptionUsageConnections({
    workerToken,
    limit: Math.min(Math.max(input.limit ?? 6, 1), 20),
    leaseMinutes: Math.min(Math.max(input.leaseMinutes ?? 15, 1), 60)
  });
  if (claimed.error) throw claimed.error;
  const summary: ScheduledSubscriptionUsageSummary = { claimed: claimed.data.length, completed: 0, failed: 0, skipped: 0 };
  const outcomes = await runClaimedConnectionsWithBoundedConcurrency(
    claimed.data,
    Math.min(Math.max(input.concurrency ?? 2, 1), 4),
    processClaimedConnection
  );
  for (const outcome of outcomes) {
    if (outcome.status === "fulfilled") summary[outcome.value] += 1;
    else summary.failed += 1;
  }
  return summary;
}

export async function runClaimedConnectionsWithBoundedConcurrency<T, R>(
  claimed: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const safeConcurrency = Math.min(Math.max(concurrency, 1), 4);
  const outcomes: PromiseSettledResult<R>[] = [];
  for (let offset = 0; offset < claimed.length; offset += safeConcurrency) {
    outcomes.push(...await Promise.allSettled(claimed.slice(offset, offset + safeConcurrency).map(worker)));
  }
  return outcomes;
}

async function processClaimedConnection(connection: ClaimedSubscriptionUsageConnection): Promise<"completed" | "failed" | "skipped"> {
  const startedAt = Date.now();
  const interval = new Date().toISOString().slice(0, 10);
  const idempotencyKey = crypto.createHash("sha256").update(JSON.stringify({
    organizationId: connection.organization_id,
    connectionId: connection.id,
    interval
  })).digest("hex");
  const syncRun = await createScheduledSubscriptionUsageSyncRun({
    organizationId: connection.organization_id,
    connectionId: connection.id,
    provider: connection.provider,
    idempotencyKey
  });
  if (syncRun.error || !syncRun.data?.id) throw syncRun.error ?? new Error("scheduled_sync_run_unavailable");
  if (["completed", "partial"].includes(syncRun.data.status)) {
    await releaseSkippedScheduledSubscriptionUsageClaim({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      claimToken: connection.sync_claim_token
    });
    return "skipped";
  }
  const syncRunId = String(syncRun.data.id);

  try {
    const access = await evaluateSubscriptionUsageOptimizationAccess(await getBillingSnapshot(connection.organization_id));
    if (!access.allowed) {
      await failScheduledSubscriptionUsageSync({
        organizationId: connection.organization_id,
        connectionId: connection.id,
        claimToken: connection.sync_claim_token,
        syncRunId,
        failureCode: "entitlement_denied",
        recoverable: true,
        retryDelayHours: 24,
        durationMs: Date.now() - startedAt
      });
      return "skipped";
    }
    const betaControlResult = await getScheduledDesignPartnerBetaControl(connection.organization_id);
    if (betaControlResult.error) throw betaControlResult.error;
    const betaRow = betaControlResult.data;
    const betaControl = betaRow ? {
      organizationId: betaRow.organization_id,
      status: betaRow.status,
      maximumContracts: betaRow.maximum_contracts,
      maximumProviderConnections: betaRow.maximum_provider_connections,
      maximumUserSeats: betaRow.maximum_user_seats,
      allowedProviders: betaRow.allowed_providers,
      expiresAt: betaRow.expires_at,
      graceEndsAt: betaRow.grace_ends_at,
      founderApprovedAt: betaRow.founder_approved_at
    } as DesignPartnerBetaControl : null;
    const betaAccess = evaluateDesignPartnerBetaMutation({ control: betaControl, action: "sync_provider" });
    if (!betaAccess.allowed) {
      await failScheduledSubscriptionUsageSync({
        organizationId: connection.organization_id,
        connectionId: connection.id,
        claimToken: connection.sync_claim_token,
        syncRunId,
        failureCode: betaAccess.reason,
        recoverable: false,
        durationMs: Date.now() - startedAt
      });
      return "skipped";
    }

    const providerToken = await getScheduledProviderToken(connection);
    await waitForProviderRateLimit(connection.provider);
    const snapshot = await fetchUsageInventorySnapshot({
      organization_id: connection.organization_id,
      connector_type: "subscription_usage",
      provider: connection.provider,
      tenant_id: connection.provider === MICROSOFT_365_USAGE_PROVIDER ? connection.provider_tenant_id : null,
      customer_id: connection.provider === GOOGLE_WORKSPACE_USAGE_PROVIDER ? connection.provider_tenant_id : null,
      domain: connection.provider === GOOGLE_WORKSPACE_USAGE_PROVIDER ? connection.provider_tenant_name : null,
      credential_reference: connection.credential_reference,
      provider_access_token: providerToken,
      page_size: 500,
      idempotency_key: idempotencyKey
    });
    if (!snapshot.ok || !snapshot.output.accepted) {
      throw new Error(snapshot.ok ? snapshot.output.warnings[0] ?? "provider_request_failed" : snapshot.errorCode);
    }

    const importRows = connection.provider === GOOGLE_WORKSPACE_USAGE_PROVIDER
      ? mapGoogleWorkspaceSnapshotToImportRows(snapshot.output)
      : mapMicrosoft365SnapshotToImportRows(snapshot.output);
    const collectedAt = snapshot.output.records[0]?.collected_at ?? new Date().toISOString();
    const assessment = assessSubscriptionUsageRows(importRows, {
      sourceLabel: `${connection.provider} scheduled synchronization`,
      collectedAt,
      allowMissingPurchasedSeats: true,
      allowMissingCostCurrency: true
    });
    const batchStatus = assessment.summary.rejectedCount > 0 || assessment.summary.partialSuccess || snapshot.output.partial
      ? "partial" as const
      : "completed" as const;
    const batch = await createScheduledSubscriptionUsageBatch({
      organizationId: connection.organization_id,
      source: connection.provider,
      status: batchStatus,
      idempotencyKey,
      provider: connection.provider,
      connectionId: connection.id,
      syncRunId,
      metadata: {
        source: "scheduled_daily",
        readyCount: assessment.summary.readyCount,
        rejectedCount: assessment.summary.rejectedCount,
        errorCount: assessment.summary.rejectedCount,
        partialSuccess: batchStatus === "partial",
        warningCodes: snapshot.output.warnings
      },
      rows: buildRowsPayload(assessment, connection, syncRunId)
    });
    if (batch.error || typeof batch.data !== "string") throw batch.error ?? new Error("scheduled_batch_persistence_failed");
    const batchId = batch.data;
    const scopeResult = await createScheduledAnalysisScope({ organizationId: connection.organization_id, batchId });
    if (scopeResult.error) throw scopeResult.error;
    const scope = parseScope(scopeResult.data);
    const [analysisRows, contracts] = await Promise.all([
      loadScheduledAnalysisRows({ organizationId: connection.organization_id, batchIds: scope.batchIds, maximumRows: MAX_ANALYSIS_ROWS }),
      loadScheduledContractCandidates(connection.organization_id)
    ]);
    if (analysisRows.error || !analysisRows.data) throw analysisRows.error ?? new Error("scheduled_analysis_rows_unavailable");
    if (contracts.error) throw contracts.error;
    const reconciliation = await reconcileUsage({
      organization_id: connection.organization_id,
      usage_import_batch_id: batchId,
      matching_mode: "balanced",
      normalized_rows: analysisRows.data.map(mapAnalysisRow),
      contract_candidates: (contracts.data ?? []).map(mapContractCandidate),
      provider_warning_codes: [...new Set([...snapshot.output.warnings, ...scope.warningCodes])]
    });
    if (!reconciliation.ok) throw new Error("reconciliation_failed");
    const findings = buildFindingPayload(connection.organization_id, scope, reconciliation.output, syncRunId);
    const persisted = await persistScheduledAnalysisFindings({
      organizationId: connection.organization_id,
      analysisScopeId: scope.analysisScopeId,
      batchId,
      provider: connection.provider,
      connectionId: connection.id,
      syncRunId,
      findings
    });
    if (persisted.error) throw persisted.error;
    await completeScheduledSubscriptionUsageSync({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      claimToken: connection.sync_claim_token,
      syncRunId,
      batchId,
      status: batchStatus,
      rowCount: assessment.summary.totalRows,
      findingCount: findings.length,
      retryCount: snapshot.output.retry_count ?? 0,
      durationMs: Date.now() - startedAt
    });
    const affectedContractIds = [...new Set(findings.flatMap((finding) =>
      Array.isArray(finding.matched_contract_ids) ? finding.matched_contract_ids : []
    ))];
    await Promise.allSettled(affectedContractIds.map((contractId) => recalculateEvidenceReadiness({
      organizationId: connection.organization_id,
      contractId
    })));
    void emitOperationalEvent({
      eventName: "subscription_usage_scheduled_sync_completed",
      severity: "P3",
      sensitivity: "customer_sensitive",
      alert: false,
      organizationId: connection.organization_id,
      action: "subscription_usage_sync",
      metadata: { provider: connection.provider, status: batchStatus, rowCount: assessment.summary.totalRows }
    });
    return "completed";
  } catch (error) {
    const failureCode = normalizeScheduledFailure(error);
    const recoverable = ["provider_unavailable", "provider_timeout", "provider_request_failed", "provider_retry_exhausted", "reconciliation_failed"].includes(failureCode);
    await failScheduledSubscriptionUsageSync({
      organizationId: connection.organization_id,
      connectionId: connection.id,
      claimToken: connection.sync_claim_token,
      syncRunId,
      failureCode,
      recoverable,
      durationMs: Date.now() - startedAt
    });
    void emitOperationalEvent({
      eventName: "subscription_usage_scheduled_sync_failed",
      severity: recoverable ? "P2" : "P1",
      sensitivity: "customer_sensitive",
      alert: true,
      organizationId: connection.organization_id,
      action: "subscription_usage_sync",
      metadata: { provider: connection.provider, failureCode, failureCategory: recoverable ? "upstream_provider_failed" : "permission_denied" }
    });
    return "failed";
  }
}

async function getScheduledProviderToken(connection: ClaimedSubscriptionUsageConnection) {
  const config = getAppConfig();
  if (connection.provider === MICROSOFT_365_USAGE_PROVIDER) {
    return (await acquireMicrosoft365ApplicationToken({
      tenantId: connection.provider_tenant_id,
      config: { clientId: config.microsoft365.clientId, clientSecret: config.microsoft365.clientSecret }
    })).accessToken;
  }
  if (GOOGLE_WORKSPACE_REQUIRED_SCOPES.some((scope) => !connection.verified_permissions.includes(scope))) {
    throw new Error("permission_error");
  }
  const credential = await getSubscriptionProviderCredential({
    organizationId: connection.organization_id,
    connectionId: connection.id,
    provider: GOOGLE_WORKSPACE_USAGE_PROVIDER
  });
  if (credential.error || !credential.data?.encrypted_credential) throw new Error("expired_credential");
  return refreshGoogleWorkspaceAccessToken({
    encryptedRefreshToken: credential.data.encrypted_credential,
    config: {
      clientId: config.googleWorkspace.clientId,
      clientSecret: config.googleWorkspace.clientSecret,
      redirectUri: config.googleWorkspace.oauthRedirectUri,
      signingSecret: config.addOns.internalSigningSecret,
      credentialEncryptionKey: config.googleWorkspace.credentialEncryptionKey
    }
  });
}

function buildRowsPayload(assessment: ReturnType<typeof assessSubscriptionUsageRows>, connection: ClaimedSubscriptionUsageConnection, syncRunId: string) {
  return assessment.rows.map((row) => ({
    row_number: row.rowNumber,
    vendor_name: row.normalized.vendor,
    product_name: row.normalized.product,
    normalized_product: row.normalized.normalizedProduct,
    product_category: row.normalized.category,
    seats_purchased: row.normalized.purchasedSeats,
    seats_used: row.normalized.activeUsers30d,
    spend_amount: row.normalized.annualCost,
    currency: row.normalized.currency,
    annual_reviewed_cost: row.normalized.annualCost,
    purchased_seats: row.normalized.purchasedSeats,
    assigned_seats: row.normalized.assignedSeats,
    active_users_30d: row.normalized.activeUsers30d,
    active_users_90d: row.normalized.activeUsers90d,
    last_activity_at: row.normalized.lastActivityAt,
    department: row.normalized.department,
    owner_label: row.normalized.owner,
    contract_reference: row.normalized.contractReference,
    source_label: row.normalized.sourceLabel,
    collected_at: row.normalized.collectedAt,
    trust_state: row.normalized.trustState,
    confidence: row.normalized.confidence,
    validation_status: row.status,
    issue_codes: row.issues.map((issue) => issue.code),
    source_row_hash: row.normalized.sourceRowHash,
    is_sample: row.normalized.isSample,
    external_product_id: row.normalized.contractReference,
    warning_codes: row.normalized.warningCodes,
    evidence_state: row.normalized.evidenceState,
    normalized_payload: {
      provider: connection.provider,
      syncRunId,
      warningCodes: row.normalized.warningCodes,
      evidenceState: row.normalized.evidenceState
    }
  }));
}

type Scope = { analysisScopeId: string; scopeFamilyKey: string; batchIds: string[]; providers: string[]; warningCodes: string[] };

function parseScope(value: unknown): Scope {
  if (!value || typeof value !== "object") throw new Error("analysis_scope_invalid");
  const candidate = value as Partial<Scope>;
  if (typeof candidate.analysisScopeId !== "string" || typeof candidate.scopeFamilyKey !== "string" || !Array.isArray(candidate.batchIds)) {
    throw new Error("analysis_scope_invalid");
  }
  return {
    analysisScopeId: candidate.analysisScopeId,
    scopeFamilyKey: candidate.scopeFamilyKey,
    batchIds: candidate.batchIds.filter((value): value is string => typeof value === "string"),
    providers: Array.isArray(candidate.providers) ? candidate.providers.filter((value): value is string => typeof value === "string") : [],
    warningCodes: Array.isArray(candidate.warningCodes) ? candidate.warningCodes.filter((value): value is string => typeof value === "string") : []
  };
}

function mapAnalysisRow(row: Record<string, unknown>) {
  return {
    usage_row_id: String(row.id), vendor: String(row.vendor_name ?? ""), product: String(row.product_name ?? ""),
    normalized_product: String(row.normalized_product ?? ""), provider: String(row.provider ?? "manual_csv") as "manual_csv" | "microsoft_365" | "google_workspace",
    external_product_id: nullableString(row.external_product_id), category: nullableString(row.product_category),
    annual_reviewed_cost: nullableNumber(row.annual_reviewed_cost), currency: nullableString(row.currency),
    purchased_seats: nullableNumber(row.purchased_seats), assigned_seats: nullableNumber(row.assigned_seats),
    active_users_30d: nullableNumber(row.active_users_30d), active_users_90d: nullableNumber(row.active_users_90d),
    last_activity_at: nullableString(row.last_activity_at), collected_at: nullableString(row.collected_at),
    trust_state: nullableString(row.trust_state), confidence: nullableNumber(row.confidence),
    is_sample: Boolean(row.is_sample), department: nullableString(row.department),
    warning_codes: Array.isArray(row.warning_codes) ? row.warning_codes.filter((value): value is string => typeof value === "string") : [],
    evidence_state: normalizeSubscriptionUsageEvidenceState(row.evidence_state)
  };
}

function mapContractCandidate(contract: Record<string, unknown>) {
  const rawMetadata = contract.contract_metadata;
  const metadata = Array.isArray(rawMetadata) ? rawMetadata[0] ?? null : rawMetadata;
  const value = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  return {
    contract_id: String(contract.id), vendor: nullableString(value.counterparty_name), title: nullableString(value.contract_title),
    renewal_date: nullableString(value.renewal_date), notice_deadline_date: nullableString(value.notice_deadline_date),
    annual_cost: nullableNumber(value.contract_value_amount), currency: nullableString(value.contract_value_currency),
    is_sample: Boolean(contract.is_sample)
  };
}

function buildFindingPayload(organizationId: string, scope: Scope, output: ReconcileUsageResponse, syncRunId: string) {
  return (output.findings ?? []).map((finding) => {
    const identity = buildStableSubscriptionUsageFindingIdentity({
      organizationId,
      finding,
      analysisScopeId: scope.analysisScopeId,
      snapshotBatchIds: scope.batchIds,
      providerSet: scope.providers,
      scopeFamilyKey: scope.scopeFamilyKey,
      syncRunId
    });
    return {
      contract_id: finding.matched_contract_ids[0] ?? null,
      finding_fingerprint: identity.findingFingerprint,
      logical_opportunity_key: identity.logicalOpportunityKey,
      evidence_hash: identity.materialEvidenceHash,
      material_evidence_hash: identity.materialEvidenceHash,
      provenance_hash: identity.provenanceHash,
      finding_type: finding.finding_type, reason_code: finding.reason_code, calculation_version: finding.calculation_version,
      calculation_family: finding.calculation_family ?? null,
      usage_row_ids: finding.source_row_ids, matched_contract_ids: finding.matched_contract_ids,
      utilization: finding.utilization, unused_seats: finding.unused_seats, confidence: finding.confidence,
      warnings: finding.warnings, estimated_savings: finding.estimated_savings, currency: finding.currency,
      recommended_action: finding.recommended_action, capability_category: finding.capability_category ?? null,
      taxonomy_version: finding.taxonomy_version ?? null, taxonomy_family: finding.taxonomy_family ?? null, involved_providers: finding.involved_providers ?? [],
      involved_products: finding.involved_products ?? [], estimated_savings_min: finding.estimated_savings_min ?? null,
      estimated_savings_max: finding.estimated_savings_max ?? null, evidence: identity.evidence
    };
  });
}

function normalizeScheduledFailure(error: unknown) {
  const value = error instanceof Error ? error.message : "verification_failed";
  const allowed = new Set(["permission_error", "expired_credential", "revoked_access", "tenant_mismatch", "verification_failed", "provider_unavailable", "provider_timeout", "provider_request_failed", "provider_retry_exhausted", "reconciliation_failed"]);
  if (allowed.has(value)) return value;
  return normalizeGoogleWorkspaceFailureCode(value) === "provider_request_failed" ? "provider_request_failed" : "verification_failed";
}

function nullableString(value: unknown) { return typeof value === "string" && value ? value : null; }
function nullableNumber(value: unknown) { const number = Number(value); return value !== null && value !== undefined && Number.isFinite(number) ? number : null; }
async function waitForProviderRateLimit(provider: string) {
  const now = Date.now();
  const permittedAt = Math.max(now, nextProviderRequestAt.get(provider) ?? now);
  nextProviderRequestAt.set(provider, permittedAt + PROVIDER_MIN_INTERVAL_MS);
  const waitMs = permittedAt - now;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}
