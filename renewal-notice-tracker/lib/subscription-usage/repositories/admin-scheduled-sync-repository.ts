import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type ClaimedSubscriptionUsageConnection = {
  id: string;
  organization_id: string;
  provider: "microsoft_365" | "google_workspace";
  provider_tenant_id: string;
  provider_tenant_name: string | null;
  credential_reference: string;
  status: string;
  connection_owner_user_id: string | null;
  sync_claim_token: string;
  verified_permissions: string[];
};

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown | null }>;
};

function rpcClient() {
  return createAdminSupabaseClient() as unknown as RpcClient;
}

export async function claimDueSubscriptionUsageConnections(input: {
  workerToken: string;
  limit: number;
  leaseMinutes: number;
}) {
  const result = await rpcClient().rpc("claim_due_subscription_usage_connections", {
    p_limit: input.limit,
    p_lease_minutes: input.leaseMinutes,
    p_worker_token: input.workerToken
  });
  return { ...result, data: (result.data ?? []) as ClaimedSubscriptionUsageConnection[] };
}

export function getScheduledDesignPartnerBetaControl(organizationId: string) {
  return createAdminSupabaseClient()
    .from("design_partner_beta_controls")
    .select("organization_id, status, maximum_contracts, maximum_provider_connections, maximum_user_seats, allowed_providers, expires_at, grace_ends_at, founder_approved_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
}

export async function createScheduledSubscriptionUsageSyncRun(input: {
  organizationId: string;
  connectionId: string;
  provider: "microsoft_365" | "google_workspace";
  idempotencyKey: string;
}) {
  const admin = createAdminSupabaseClient();
  const startedAt = new Date().toISOString();
  const inserted = await admin.from("subscription_usage_sync_runs").insert({
    organization_id: input.organizationId,
    provider_connection_id: input.connectionId,
    provider: input.provider,
    status: "processing",
    idempotency_key: input.idempotencyKey,
    started_at: startedAt,
    metadata: { source: "scheduled_daily" }
  }).select("id, status").single();
  if (!inserted.error) return inserted;
  return admin.from("subscription_usage_sync_runs")
    .select("id, status")
    .eq("organization_id", input.organizationId)
    .eq("provider_connection_id", input.connectionId)
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();
}

export function releaseSkippedScheduledSubscriptionUsageClaim(input: {
  organizationId: string;
  connectionId: string;
  claimToken: string;
}) {
  const releasedAt = new Date().toISOString();
  return createAdminSupabaseClient().from("subscription_usage_provider_connections").update({
    next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    sync_claim_token: null,
    sync_claimed_at: null,
    sync_claim_expires_at: null,
    updated_at: releasedAt
  }).eq("organization_id", input.organizationId).eq("id", input.connectionId).eq("sync_claim_token", input.claimToken);
}

export function createScheduledSubscriptionUsageBatch(input: {
  organizationId: string;
  source: string;
  status: "completed" | "partial" | "failed";
  idempotencyKey: string;
  provider: "microsoft_365" | "google_workspace";
  connectionId: string;
  syncRunId: string;
  metadata: Record<string, unknown>;
  rows: Record<string, unknown>[];
}) {
  return rpcClient().rpc("create_scheduled_subscription_usage_batch_with_rows", {
    p_organization_id: input.organizationId,
    p_source: input.source,
    p_status: input.status,
    p_idempotency_key: input.idempotencyKey,
    p_provider: input.provider,
    p_provider_connection_id: input.connectionId,
    p_sync_run_id: input.syncRunId,
    p_metadata: input.metadata,
    p_rows: input.rows
  });
}

export function createScheduledAnalysisScope(input: {
  organizationId: string;
  batchId: string;
}) {
  return rpcClient().rpc("create_subscription_usage_analysis_scope", {
    p_organization_id: input.organizationId,
    p_current_batch_id: input.batchId,
    p_include_manual_imports: false
  });
}

export function persistScheduledAnalysisFindings(input: {
  organizationId: string;
  analysisScopeId: string;
  batchId: string;
  provider: "microsoft_365" | "google_workspace";
  connectionId: string;
  syncRunId: string;
  findings: Record<string, unknown>[];
}) {
  return rpcClient().rpc("persist_subscription_usage_analysis_findings", {
    p_organization_id: input.organizationId,
    p_analysis_scope_id: input.analysisScopeId,
    p_batch_id: input.batchId,
    p_provider: input.provider,
    p_provider_connection_id: input.connectionId,
    p_sync_run_id: input.syncRunId,
    p_findings: input.findings
  });
}

export function cleanupSubscriptionUsageConsentAttempts(input: { retentionDays?: number; limit?: number } = {}) {
  return rpcClient().rpc("cleanup_subscription_usage_consent_attempts", {
    p_consumed_retention_days: input.retentionDays ?? 30,
    p_limit: input.limit ?? 500
  });
}

export async function loadScheduledAnalysisRows(input: {
  organizationId: string;
  batchIds: string[];
  maximumRows: number;
}) {
  const admin = createAdminSupabaseClient();
  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let offset = 0; offset <= input.maximumRows; offset += pageSize) {
    const result = await admin.from("usage_import_rows")
      .select("id, vendor_name, product_name, normalized_product, product_category, annual_reviewed_cost, currency, purchased_seats, assigned_seats, active_users_30d, active_users_90d, last_activity_at, collected_at, trust_state, confidence, is_sample, provider, external_product_id, department, warning_codes, evidence_state")
      .eq("organization_id", input.organizationId)
      .in("batch_id", input.batchIds)
      .in("validation_status", ["ready", "needs_review"])
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < pageSize) return { data: rows, error: null };
    if (rows.length >= input.maximumRows) return { data: null, error: new Error("subscription_usage_analysis_scope_too_large") };
  }
  return { data: null, error: new Error("subscription_usage_analysis_scope_too_large") };
}

export async function loadScheduledContractCandidates(organizationId: string) {
  const result = await createAdminSupabaseClient().from("contracts").select(`
    id,
    is_sample,
    contract_metadata (
      contract_title,
      counterparty_name,
      renewal_date,
      notice_deadline_date,
      contract_value_amount,
      contract_value_currency
    )
  `)
    .eq("organization_id", organizationId)
    .eq("is_sample", false)
    .order("id", { ascending: true })
    .range(0, 1000);
  if (result.error) return result;
  if ((result.data ?? []).length > 1000) {
    return { data: null, error: new Error("subscription_usage_contract_candidate_scope_too_large") };
  }
  return result;
}

export async function completeScheduledSubscriptionUsageSync(input: {
  organizationId: string;
  connectionId: string;
  claimToken: string;
  syncRunId: string;
  batchId: string;
  status: "completed" | "partial";
  rowCount: number;
  findingCount: number;
  retryCount: number;
  durationMs: number;
}) {
  const admin = createAdminSupabaseClient();
  const completedAt = new Date().toISOString();
  const run = await admin.from("subscription_usage_sync_runs").update({
    status: input.status,
    usage_import_batch_id: input.batchId,
    row_count: input.rowCount,
    finding_count: input.findingCount,
    retry_count: input.retryCount,
    duration_ms: input.durationMs,
    completed_at: completedAt,
    updated_at: completedAt
  }).eq("organization_id", input.organizationId).eq("id", input.syncRunId);
  if (run.error) return run;
  return admin.from("subscription_usage_provider_connections").update({
    status: "connected",
    last_successful_sync_at: completedAt,
    last_error_code: null,
    next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    sync_claim_token: null,
    sync_claimed_at: null,
    sync_claim_expires_at: null,
    updated_at: completedAt
  }).eq("organization_id", input.organizationId).eq("id", input.connectionId).eq("sync_claim_token", input.claimToken);
}

export async function failScheduledSubscriptionUsageSync(input: {
  organizationId: string;
  connectionId: string;
  claimToken: string;
  syncRunId: string;
  failureCode: string;
  recoverable: boolean;
  retryDelayHours?: number;
  durationMs: number;
}) {
  const admin = createAdminSupabaseClient();
  const failedAt = new Date().toISOString();
  await admin.from("subscription_usage_sync_runs").update({
    status: "failed",
    failed_at: failedAt,
    duration_ms: input.durationMs,
    last_error_code: input.failureCode,
    provider_error_category: input.failureCode,
    updated_at: failedAt
  }).eq("organization_id", input.organizationId).eq("id", input.syncRunId);
  return admin.from("subscription_usage_provider_connections").update({
    status: input.recoverable ? "connected" : input.failureCode,
    last_error_code: input.failureCode,
    next_scheduled_sync_at: input.recoverable ? new Date(Date.now() + (input.retryDelayHours ?? 1) * 60 * 60 * 1000).toISOString() : null,
    sync_claim_token: null,
    sync_claimed_at: null,
    sync_claim_expires_at: null,
    updated_at: failedAt
  }).eq("organization_id", input.organizationId).eq("id", input.connectionId).eq("sync_claim_token", input.claimToken);
}
