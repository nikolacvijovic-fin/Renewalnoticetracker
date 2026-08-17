"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganization, type MembershipRole } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { enforceFeatureAccess, getBillingSnapshot } from "@/lib/billing/entitlements";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reconcileUsage } from "@/lib/add-ons/python-intelligence-client";
import { fetchUsageInventorySnapshot } from "@/lib/add-ons/java-enterprise-client";
import { getAppConfig } from "@/lib/config";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { evaluateSubscriptionUsageOptimizationAccess } from "@/lib/subscription-usage/access";
import {
  acquireMicrosoft365ApplicationToken,
  buildMicrosoft365AdminConsentUrl,
  buildMicrosoft365ConnectionRecord,
  buildMicrosoft365SyncIdempotencyKey,
  canManageSubscriptionUsageConnection,
  mapMicrosoft365SnapshotToImportRows,
  MICROSOFT_365_USAGE_PROVIDER,
  MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS,
  hashMicrosoft365ConsentNonce,
  sanitizeMicrosoft365OperationalMetadata,
  verifyMicrosoft365Connection,
  verifyMicrosoft365AdminConsentState,
  type Microsoft365ConnectionStatus
} from "@/lib/subscription-usage/microsoft365";
import {
  assessSubscriptionUsageRows,
  buildSubscriptionUsageImportIdempotencyKey,
  parseSubscriptionUsageImportFile
} from "@/lib/subscription-usage/usage-import";
import { sanitizeSubscriptionUsageAuditMetadata } from "@/lib/subscription-usage/findings";
import { prepareSubscriptionUsageFindingReview } from "@/lib/subscription-usage/findings";
import {
  buildGoogleWorkspaceAuthorizationUrl,
  buildGoogleWorkspaceConnectionRecord,
  buildGoogleWorkspaceSyncIdempotencyKey,
  encryptGoogleWorkspaceCredential,
  exchangeGoogleWorkspaceAuthorizationCode,
  GOOGLE_WORKSPACE_USAGE_PROVIDER,
  mapGoogleWorkspaceSnapshotToImportRows,
  normalizeGoogleWorkspaceFailureCode,
  refreshGoogleWorkspaceAccessToken,
  sanitizeGoogleWorkspaceOperationalMetadata,
  verifyGoogleWorkspaceAuthorizationState,
  type GoogleWorkspaceConnectionStatus
} from "@/lib/subscription-usage/google-workspace";
import {
  getSubscriptionProviderCredential,
  upsertSubscriptionProviderCredential
} from "@/lib/subscription-usage/repositories/admin-provider-credentials-repository";
import type { SubscriptionUsageImportAssessment } from "@/lib/subscription-usage/types";
import type { ReconcileUsageResponse } from "@/lib/add-ons/python-intelligence-client";

const MAX_USAGE_IMPORT_ROWS = 1000;
const MAX_ANALYSIS_USAGE_ROWS = 10_000;
const ANALYSIS_USAGE_PAGE_SIZE = 500;

type SubscriptionUsageRowRecord = {
  id: string;
  vendor_name: string | null;
  product_name: string | null;
  normalized_product: string | null;
  product_category: string | null;
  annual_reviewed_cost: number | null;
  currency: string | null;
  purchased_seats: number | null;
  assigned_seats: number | null;
  active_users_30d: number | null;
  active_users_90d: number | null;
  last_activity_at: string | null;
  collected_at: string | null;
  trust_state: string | null;
  confidence: number | null;
  is_sample: boolean | null;
  provider: "manual_csv" | "microsoft_365" | "google_workspace" | null;
  external_product_id: string | null;
  department: string | null;
};

type SubscriptionUsageQueryResult<T> = {
  data: T;
  error: unknown | null;
};

type SubscriptionUsageRowsSelectQuery = {
  eq(column: string, value: string): SubscriptionUsageRowsSelectQuery;
  in(column: string, values: string[]): SubscriptionUsageRowsSelectQuery;
  order(column: string, options: { ascending: boolean }): SubscriptionUsageRowsSelectQuery;
  range(from: number, to: number): Promise<SubscriptionUsageQueryResult<SubscriptionUsageRowRecord[] | null>>;
  limit(count: number): Promise<SubscriptionUsageQueryResult<SubscriptionUsageRowRecord[] | null>>;
};

type SubscriptionUsageSupabaseClient = {
  from(table: "usage_import_batches"): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, options: { ascending: boolean }): {
          limit(count: number): {
            maybeSingle(): Promise<SubscriptionUsageQueryResult<UsageBatchRecord | null>>;
          };
        };
      };
    };
  };
  from(table: "usage_import_rows"): {
    select(columns: string): SubscriptionUsageRowsSelectQuery;
  };
  from(table: "subscription_usage_provider_connections"): SubscriptionUsageConnectionTable;
  from(table: "subscription_usage_sync_runs"): SubscriptionUsageSyncRunTable;
  from(table: "contracts"): SubscriptionUsageContractTable;
  from(table: "license_waste_opportunities"): SubscriptionUsageFindingTable;
  rpc(name: "create_subscription_usage_batch_with_rows" | "disconnect_google_workspace_subscription_usage_connection" | "create_subscription_usage_consent_attempt" | "consume_subscription_usage_consent_attempt" | "create_subscription_usage_analysis_scope" | "persist_subscription_usage_analysis_findings", args: Record<string, unknown>): Promise<SubscriptionUsageQueryResult<unknown>>;
};

type SubscriptionUsageAnalysisScope = {
  analysisScopeId: string;
  scopeKey: string;
  scopeFamilyKey: string;
  batchIds: string[];
  providers: string[];
  warningCodes: string[];
};

type UsageBatchRecord = {
  id: string;
  status: string;
  provider: string | null;
  created_at: string;
};

type SubscriptionUsageConnectionRecord = {
  id: string;
  organization_id: string;
  provider: "microsoft_365" | "google_workspace";
  provider_tenant_id: string;
  provider_tenant_name: string | null;
  status: Microsoft365ConnectionStatus | GoogleWorkspaceConnectionStatus;
  credential_reference: string;
  credential_fingerprint: string;
  last_successful_sync_at: string | null;
  last_error_code: string | null;
  next_scheduled_sync_at: string | null;
  connection_owner_user_id: string | null;
  updated_at: string;
};

type SubscriptionUsageSyncRunRecord = {
  id: string;
  status: string;
  idempotency_key: string;
  row_count: number;
  finding_count: number;
  retry_count: number;
  last_error_code: string | null;
  created_at: string;
};

type SubscriptionUsageConnectionSelectQuery = {
  eq(column: string, value: string): SubscriptionUsageConnectionSelectQuery;
  order(column: string, options: { ascending: boolean }): {
    limit(count: number): {
      maybeSingle(): Promise<SubscriptionUsageQueryResult<SubscriptionUsageConnectionRecord | null>>;
    };
  };
  maybeSingle(): Promise<SubscriptionUsageQueryResult<SubscriptionUsageConnectionRecord | null>>;
};

type SubscriptionUsageConnectionTable = {
  select(columns: string): SubscriptionUsageConnectionSelectQuery;
  upsert(values: Record<string, unknown>, options: { onConflict: string }): {
    select(columns: string): {
      single(): Promise<SubscriptionUsageQueryResult<SubscriptionUsageConnectionRecord | null>>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): {
      eq(column: string, value: string): Promise<SubscriptionUsageQueryResult<null>>;
    };
  };
};

type SubscriptionUsageSyncRunSelectQuery = {
  eq(column: string, value: string): SubscriptionUsageSyncRunSelectQuery;
  order(column: string, options: { ascending: boolean }): {
    limit(count: number): {
      maybeSingle(): Promise<SubscriptionUsageQueryResult<SubscriptionUsageSyncRunRecord | null>>;
    };
  };
};

type SubscriptionUsageSyncRunTable = {
  select(columns: string): SubscriptionUsageSyncRunSelectQuery;
  insert(values: Record<string, unknown>): {
    select(columns: string): {
      single(): Promise<SubscriptionUsageQueryResult<{ id: string } | null>>;
    };
  };
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): {
      eq(column: string, value: string): Promise<SubscriptionUsageQueryResult<null>>;
    };
  };
};

type SubscriptionUsageContractRecord = {
  id: string;
  is_sample: boolean | null;
  contract_metadata:
    | {
        contract_title: string | null;
        counterparty_name: string | null;
        renewal_date: string | null;
        notice_deadline_date: string | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }
    | Array<{
        contract_title: string | null;
        counterparty_name: string | null;
        renewal_date: string | null;
        notice_deadline_date: string | null;
        contract_value_amount: number | null;
        contract_value_currency: string | null;
      }>
    | null;
};

type SubscriptionUsageContractTable = {
  select(columns: string): {
    eq(column: string, value: string): {
      eq(column: string, value: boolean): {
        order(column: string, options: { ascending: boolean }): {
          range(from: number, to: number): Promise<SubscriptionUsageQueryResult<SubscriptionUsageContractRecord[] | null>>;
        };
      };
    };
  };
};

type SubscriptionUsageFindingRecord = {
  id: string;
  finding_fingerprint: string | null;
  review_status: string | null;
  provider?: string | null;
};

type SubscriptionUsageFindingSelectQuery = {
  eq(column: string, value: string): SubscriptionUsageFindingSelectQuery;
  in(column: string, values: string[]): Promise<SubscriptionUsageQueryResult<SubscriptionUsageFindingRecord[] | null>>;
  maybeSingle(): Promise<SubscriptionUsageQueryResult<SubscriptionUsageFindingRecord | null>>;
};

type SubscriptionUsageFindingTable = {
  select(columns: string): SubscriptionUsageFindingSelectQuery;
  insert(values: Record<string, unknown>): Promise<SubscriptionUsageQueryResult<null>>;
  update(values: Record<string, unknown>): {
    eq(column: string, value: string): {
      eq(column: string, value: string): Promise<SubscriptionUsageQueryResult<null>>;
      not(column: string, operator: string, value: string): Promise<SubscriptionUsageQueryResult<null>>;
    };
  };
};

export type SubscriptionUsageImportPreview = {
  assessment: SubscriptionUsageImportAssessment;
  idempotencyKey: string;
};

async function assertSubscriptionUsageOptimizationReady(organizationId: string) {
  const access = await evaluateSubscriptionUsageOptimizationAccess(await getBillingSnapshot(organizationId));
  if (!access.allowed) {
    throw new Error(access.customerSafeMessage);
  }
}

function createSubscriptionUsageSupabaseClient() {
  return createServerSupabaseClient() as unknown as SubscriptionUsageSupabaseClient;
}

function assertCanManageSubscriptionUsageConnection(role: MembershipRole) {
  if (!canManageSubscriptionUsageConnection(role)) {
    throw new Error("Only organization owners, admins, and operators can manage subscription usage connections.");
  }
}

function getGoogleWorkspaceOAuthConfig() {
  const config = getAppConfig();
  return {
    clientId: config.googleWorkspace.clientId,
    clientSecret: config.googleWorkspace.clientSecret,
    redirectUri: config.googleWorkspace.oauthRedirectUri,
    signingSecret: config.addOns.internalSigningSecret,
    credentialEncryptionKey: config.googleWorkspace.credentialEncryptionKey
  };
}

export async function startGoogleWorkspaceConnectionAction(formData: FormData) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_google_workspace_connect" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const result = buildGoogleWorkspaceAuthorizationUrl({
    config: getGoogleWorkspaceOAuthConfig(),
    state: {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      customerId: String(formData.get("customerId") ?? ""),
      domain: String(formData.get("domain") ?? ""),
      nonce: crypto.randomUUID(),
      issuedAt: new Date().toISOString()
    }
  });
  if (!result.ok) throw new Error(result.safeMessage);
  redirect(result.url);
}

export async function completeGoogleWorkspaceAuthorization(input: { state: string; code: string }) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  const config = getGoogleWorkspaceOAuthConfig();
  if (!config.signingSecret || !config.credentialEncryptionKey) {
    throw new Error("Google Workspace connection security is not configured.");
  }
  const state = verifyGoogleWorkspaceAuthorizationState(input.state, config.signingSecret);
  if (!state || state.organizationId !== context.organizationId || state.actorUserId !== context.user.id) {
    throw new Error("Google Workspace connection state is invalid for this organization.");
  }
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_google_workspace_callback" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const token = await exchangeGoogleWorkspaceAuthorizationCode({ code: input.code, config });
  const connection = buildGoogleWorkspaceConnectionRecord({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    customerId: state.customerId,
    domain: state.domain
  });
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data, error } = await supabase
    .from("subscription_usage_provider_connections")
    .upsert(
      {
        organization_id: connection.organizationId,
        provider: connection.provider,
        provider_tenant_id: connection.customerId,
        provider_tenant_name: connection.domain,
        status: connection.status,
        credential_reference: connection.credentialReference,
        credential_fingerprint: connection.credentialFingerprint,
        required_permissions: connection.requiredPermissions,
        requested_permissions: connection.requiredPermissions,
        verified_permissions: token.grantedScopes,
        last_verified_at: new Date().toISOString(),
        connection_owner_user_id: connection.actorUserId,
        disconnected_at: null,
        last_error_code: null,
        next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: { connectionMode: "google_admin_oauth", domain: connection.domain },
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,provider,provider_tenant_id" }
    )
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .single();
  if (error || !data?.id) throw error ?? new Error("Unable to create Google Workspace connection.");

  const credentialResult = await upsertSubscriptionProviderCredential({
    organizationId: context.organizationId,
    connectionId: data.id,
    provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
    encryptedCredential: encryptGoogleWorkspaceCredential(token.refreshToken, config.credentialEncryptionKey),
    credentialFingerprint: connection.credentialFingerprint
  });
  if (credentialResult.error) {
    await supabase
      .from("subscription_usage_provider_connections")
      .update({ status: "expired_credential", last_error_code: "credential_vault_write_failed", updated_at: new Date().toISOString() })
      .eq("organization_id", context.organizationId)
      .eq("id", data.id);
    throw new Error("Google Workspace credential could not be stored safely.");
  }

  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "subscription_usage.google_workspace_connected",
    entityType: "subscription_usage_provider_connection",
    entityId: data.id,
    details: sanitizeGoogleWorkspaceOperationalMetadata({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      connectionId: data.id,
      customerId: connection.customerId,
      domain: connection.domain,
      provider: connection.provider,
      status: connection.status
    })
  }, { mode: "best_effort" });
  revalidatePath("/dashboard/subscription-optimization");
  return data;
}

function getMicrosoft365AdminConsentConfig() {
  const config = getAppConfig();
  return {
    clientId: config.microsoft365.clientId,
    clientSecret: config.microsoft365.clientSecret,
    redirectUri: config.microsoft365.adminConsentRedirectUri,
    signingSecret: config.addOns.internalSigningSecret
  };
}

export async function getMicrosoft365AdminConsentUrlAction() {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_microsoft365_connect" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const config = getMicrosoft365AdminConsentConfig();
  const issuedAt = new Date();
  const state = {
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    nonce: crypto.randomUUID(),
    issuedAt: issuedAt.toISOString()
  };
  const result = buildMicrosoft365AdminConsentUrl({ config, state });
  if (!result.ok) return result;
  const { error } = await createSubscriptionUsageSupabaseClient().rpc("create_subscription_usage_consent_attempt", {
    p_organization_id: context.organizationId,
    p_provider: MICROSOFT_365_USAGE_PROVIDER,
    p_nonce_hash: hashMicrosoft365ConsentNonce(state.nonce),
    p_requested_permissions: [...MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS],
    p_expires_at: new Date(issuedAt.getTime() + 15 * 60 * 1000).toISOString()
  });
  if (error) throw error;
  return result;
}

export async function completeMicrosoft365AdminConsent(input: {
  state: string;
  tenantId: string;
  tenantName?: string | null;
  adminConsent: boolean;
}) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  const appConfig = getAppConfig();
  const signingSecret = appConfig.addOns.internalSigningSecret;
  if (!signingSecret) throw new Error("Add-on signing secret is required to verify Microsoft 365 connection state.");
  if (!input.adminConsent) throw new Error("Microsoft 365 admin consent was not granted.");

  const state = verifyMicrosoft365AdminConsentState(input.state, signingSecret);
  if (!state || state.organizationId !== context.organizationId || state.actorUserId !== context.user.id) {
    throw new Error("Microsoft 365 connection state is invalid for this organization.");
  }
  const { error: consumeError } = await createSubscriptionUsageSupabaseClient().rpc("consume_subscription_usage_consent_attempt", {
    p_organization_id: context.organizationId,
    p_provider: MICROSOFT_365_USAGE_PROVIDER,
    p_nonce_hash: hashMicrosoft365ConsentNonce(state.nonce)
  });
  if (consumeError) throw new Error("Microsoft 365 connection state was expired or already used.");

  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_microsoft365_callback" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const token = await acquireMicrosoft365ApplicationToken({
    tenantId: input.tenantId,
    config: {
      clientId: appConfig.microsoft365.clientId,
      clientSecret: appConfig.microsoft365.clientSecret
    }
  });
  const verification = await verifyMicrosoft365Connection({
    tenantId: input.tenantId,
    accessToken: token.accessToken,
    permissions: token.permissions
  });

  const connection = buildMicrosoft365ConnectionRecord({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    tenantId: input.tenantId,
    tenantName: input.tenantName
  });
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data, error } = await supabase
    .from("subscription_usage_provider_connections")
    .upsert(
      {
        organization_id: connection.organizationId,
        provider: connection.provider,
        provider_tenant_id: connection.tenantId,
        provider_tenant_name: connection.tenantName,
        status: connection.status,
        credential_reference: connection.credentialReference,
        credential_fingerprint: connection.credentialFingerprint,
        required_permissions: connection.requiredPermissions,
        requested_permissions: connection.requiredPermissions,
        verified_permissions: verification.verifiedPermissions,
        last_verified_at: new Date().toISOString(),
        connection_owner_user_id: connection.actorUserId,
        disconnected_at: null,
        last_error_code: null,
        next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        metadata: { connectionMode: "admin_consent_application_permissions", tokenStorage: "memory_only" },
        updated_at: new Date().toISOString()
      },
      { onConflict: "organization_id,provider,provider_tenant_id" }
    )
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .single();

  if (error) throw error;

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.microsoft365_connected",
      entityType: "subscription_usage_provider_connection",
      entityId: data?.id ?? null,
      details: sanitizeMicrosoft365OperationalMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        connectionId: data?.id,
        tenantId: connection.tenantId,
        tenantName: connection.tenantName,
        provider: MICROSOFT_365_USAGE_PROVIDER,
        status: connection.status
      })
    },
    { mode: "best_effort" }
  );

  revalidatePath("/dashboard/subscription-optimization");
  return data;
}

export async function disconnectMicrosoft365UsageConnectionAction(formData: FormData) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  const connectionId = String(formData.get("connectionId") ?? "").trim();
  if (!connectionId) throw new Error("Microsoft 365 connection is required.");

  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: connection, error: connectionError } = await supabase
    .from("subscription_usage_provider_connections")
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.provider !== MICROSOFT_365_USAGE_PROVIDER) {
    throw new Error("Microsoft 365 connection was not found for this organization.");
  }
  const { error } = await supabase
    .from("subscription_usage_provider_connections")
    .update({
      status: "disconnected",
      disconnected_at: new Date().toISOString(),
      next_scheduled_sync_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId);

  if (error) throw error;

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.microsoft365_disconnected",
      entityType: "subscription_usage_provider_connection",
      entityId: connectionId,
      details: sanitizeMicrosoft365OperationalMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        connectionId,
        status: "disconnected",
        provider: MICROSOFT_365_USAGE_PROVIDER
      })
    },
    { mode: "best_effort" }
  );

  revalidatePath("/dashboard/subscription-optimization");
}

export async function disconnectGoogleWorkspaceConnectionAction(formData: FormData) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  const connectionId = String(formData.get("connectionId") ?? "").trim();
  if (!connectionId) throw new Error("Google Workspace connection is required.");
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: connection, error: connectionError } = await supabase
    .from("subscription_usage_provider_connections")
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.provider !== GOOGLE_WORKSPACE_USAGE_PROVIDER) {
    throw new Error("Google Workspace connection was not found for this organization.");
  }
  const { error } = await supabase.rpc("disconnect_google_workspace_subscription_usage_connection", {
    p_organization_id: context.organizationId,
    p_connection_id: connectionId
  });
  if (error) throw error;
  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "subscription_usage.google_workspace_disconnected",
    entityType: "subscription_usage_provider_connection",
    entityId: connectionId,
    details: sanitizeGoogleWorkspaceOperationalMetadata({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      connectionId,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      status: "disconnected"
    })
  }, { mode: "best_effort" });
  revalidatePath("/dashboard/subscription-optimization");
}

export async function syncGoogleWorkspaceUsageNowAction(formData: FormData) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_google_workspace_sync_now" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);
  const connectionId = String(formData.get("connectionId") ?? "").trim();
  if (!connectionId) throw new Error("Google Workspace connection is required.");
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: connection, error: connectionError } = await supabase
    .from("subscription_usage_provider_connections")
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.provider !== GOOGLE_WORKSPACE_USAGE_PROVIDER || connection.status !== "connected") {
    throw new Error("Google Workspace must be connected before syncing usage.");
  }

  const idempotencyKey = buildGoogleWorkspaceSyncIdempotencyKey({
    organizationId: context.organizationId,
    connectionId,
    collectedAt: new Date().toISOString()
  });
  const startedAt = Date.now();
  const { data: syncRun, error: syncRunError } = await supabase
    .from("subscription_usage_sync_runs")
    .insert({
      organization_id: context.organizationId,
      provider_connection_id: connectionId,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      status: "processing",
      idempotency_key: idempotencyKey,
      started_at: new Date(startedAt).toISOString(),
      metadata: { source: "manual_sync_now" }
    })
    .select("id")
    .single();
  if (syncRunError) {
    const { data: existing } = await supabase
      .from("subscription_usage_sync_runs")
      .select("id, status, idempotency_key, row_count, finding_count, retry_count, last_error_code, created_at")
      .eq("organization_id", context.organizationId)
      .eq("provider_connection_id", connectionId)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing && ["completed", "partial", "processing"].includes(existing.status)) return existing;
    throw syncRunError;
  }
  if (!syncRun?.id) throw new Error("Unable to start Google Workspace usage sync.");
  const syncRunId = String(syncRun.id);

  try {
    const credential = await getSubscriptionProviderCredential({
      organizationId: context.organizationId,
      connectionId,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER
    });
    if (credential.error || !credential.data?.encrypted_credential) throw new Error("expired_credential");
    const accessToken = await refreshGoogleWorkspaceAccessToken({
      encryptedRefreshToken: credential.data.encrypted_credential,
      config: getGoogleWorkspaceOAuthConfig()
    });
    const snapshot = await fetchUsageInventorySnapshot({
      organization_id: context.organizationId,
      connector_type: "subscription_usage",
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      customer_id: connection.provider_tenant_id,
      domain: connection.provider_tenant_name,
      credential_reference: connection.credential_reference,
      provider_access_token: accessToken,
      page_size: 500,
      idempotency_key: idempotencyKey
    });
    if (!snapshot.ok || !snapshot.output.accepted) {
      const errorCode = normalizeGoogleWorkspaceFailureCode(snapshot.ok ? snapshot.output.warnings[0] : snapshot.errorCode);
      await markGoogleWorkspaceSyncFailed({
        organizationId: context.organizationId,
        connectionId,
        syncRunId,
        startedAt,
        errorCode,
        retryCount: snapshot.ok ? snapshot.output.retry_count ?? 0 : 0
      });
      return snapshot;
    }

    const rows = mapGoogleWorkspaceSnapshotToImportRows(snapshot.output);
    const collectedAt = snapshot.output.records[0]?.collected_at ?? new Date().toISOString();
    const assessment = assessSubscriptionUsageRows(rows, {
      sourceLabel: `Google Workspace ${connection.provider_tenant_name ?? connection.provider_tenant_id}`,
      collectedAt,
      allowMissingPurchasedSeats: true,
      allowMissingCostCurrency: true
    });
    const batchId = await createUsageBatchWithRows({
      organizationId: context.organizationId,
      source: "google_workspace",
      status: deriveImportBatchStatus(assessment.summary),
      fileName: null,
      idempotencyKey,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      providerConnectionId: connectionId,
      syncRunId,
      metadata: {
        templateVersion: "subscription_usage_google_workspace_v1",
        provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
        readyCount: assessment.summary.readyCount,
        rejectedCount: assessment.summary.rejectedCount,
        errorCount: assessment.summary.rejectedCount,
        partialSuccess: assessment.summary.partialSuccess || Boolean(snapshot.output.partial),
        warningCodes: snapshot.output.warnings
      },
      rows: buildUsageRowsPayload(assessment, {
        provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
        providerConnectionId: connectionId,
        syncRunId
      })
    });
    const reconciliation = await reconcileAndPersistUsageBatch({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      batchId,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      providerConnectionId: connectionId,
      syncRunId,
      providerWarningCodes: snapshot.output.warnings
    });
    const findingCount = reconciliation.ok ? reconciliation.output.findings?.length ?? 0 : 0;
    const finalStatus = assessment.summary.rejectedCount > 0 || snapshot.output.partial || !reconciliation.ok ? "partial" : "completed";
    const durationMs = Date.now() - startedAt;
    await supabase.from("subscription_usage_sync_runs").update({
      status: finalStatus,
      usage_import_batch_id: batchId,
      row_count: assessment.summary.totalRows,
      finding_count: findingCount,
      retry_count: snapshot.output.retry_count ?? 0,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      metadata: { warningCodes: snapshot.output.warnings },
      updated_at: new Date().toISOString()
    }).eq("organization_id", context.organizationId).eq("id", syncRunId);
    await supabase.from("subscription_usage_provider_connections").update({
      status: "connected",
      last_successful_sync_at: new Date().toISOString(),
      last_error_code: null,
      next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq("organization_id", context.organizationId).eq("id", connectionId);
    await createAuditLog({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.google_workspace_sync_completed",
      entityType: "subscription_usage_sync_run",
      entityId: syncRunId,
      details: sanitizeGoogleWorkspaceOperationalMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        connectionId,
        syncRunId,
        customerId: connection.provider_tenant_id,
        domain: connection.provider_tenant_name,
        provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
        status: finalStatus,
        rowCount: assessment.summary.totalRows,
        retryCount: snapshot.output.retry_count ?? 0,
        durationMs,
        warningCodes: snapshot.output.warnings
      })
    }, { mode: "best_effort" });
    revalidatePath("/dashboard/subscription-optimization");
    return { syncRunId, batchId, reconciliation };
  } catch (error) {
    const code = normalizeGoogleWorkspaceFailureCode(error instanceof Error ? error.message : "google_workspace_sync_failed");
    await markGoogleWorkspaceSyncFailed({
      organizationId: context.organizationId,
      connectionId,
      syncRunId,
      startedAt,
      errorCode: code,
      retryCount: 0
    });
    throw new Error(code === "revoked_access" ? "Google Workspace access was revoked. Reconnect to continue syncing." : "Google Workspace synchronization failed safely.");
  }
}

async function markGoogleWorkspaceSyncFailed(input: {
  organizationId: string;
  connectionId: string;
  syncRunId: string;
  startedAt: number;
  errorCode: string;
  retryCount: number;
}) {
  const supabase = createSubscriptionUsageSupabaseClient();
  const status = input.errorCode === "revoked_access"
    ? "revoked_access"
    : input.errorCode === "unauthorized"
      ? "permission_error"
      : input.errorCode === "expired_credential"
        ? "expired_credential"
        : "connected";
  await Promise.all([
    supabase.from("subscription_usage_sync_runs").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      duration_ms: Date.now() - input.startedAt,
      retry_count: input.retryCount,
      provider_error_category: input.errorCode,
      last_error_code: input.errorCode,
      updated_at: new Date().toISOString()
    }).eq("organization_id", input.organizationId).eq("id", input.syncRunId),
    supabase.from("subscription_usage_provider_connections").update({
      status,
      last_error_code: input.errorCode,
      next_scheduled_sync_at: status === "connected" ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq("organization_id", input.organizationId).eq("id", input.connectionId)
  ]);
  void emitOperationalEvent({
    eventName: "subscription_usage.google_workspace_sync_failed",
    severity: status === "revoked_access" || status === "permission_error" ? "P2" : "P3",
    sensitivity: "customer_sensitive",
    alert: status === "revoked_access" || status === "permission_error",
    organizationId: input.organizationId,
    action: "subscription_usage_sync",
    metadata: sanitizeGoogleWorkspaceOperationalMetadata({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      syncRunId: input.syncRunId,
      provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
      status,
      lastErrorCode: input.errorCode,
      retryCount: input.retryCount,
      durationMs: Date.now() - input.startedAt
    })
  });
}

export async function syncMicrosoft365UsageNowAction(formData: FormData) {
  const context = await requireOrganization();
  assertCanManageSubscriptionUsageConnection(context.role);
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_microsoft365_sync_now" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const connectionId = String(formData.get("connectionId") ?? "").trim();
  if (!connectionId) throw new Error("Microsoft 365 connection is required.");

  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: connection, error: connectionError } = await supabase
    .from("subscription_usage_provider_connections")
    .select("id, organization_id, provider, provider_tenant_id, provider_tenant_name, status, credential_reference, credential_fingerprint, last_successful_sync_at, last_error_code, next_scheduled_sync_at, connection_owner_user_id, updated_at")
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId)
    .maybeSingle();

  if (connectionError) throw connectionError;
  if (!connection || connection.status !== "connected") {
    throw new Error("Microsoft 365 must be connected before syncing usage.");
  }

  const idempotencyKey = buildMicrosoft365SyncIdempotencyKey({
    organizationId: context.organizationId,
    connectionId,
    collectedAt: new Date().toISOString()
  });
  const startedAt = Date.now();
  const { data: syncRun, error: syncRunError } = await supabase
    .from("subscription_usage_sync_runs")
    .insert({
      organization_id: context.organizationId,
      provider_connection_id: connectionId,
      provider: MICROSOFT_365_USAGE_PROVIDER,
      status: "processing",
      idempotency_key: idempotencyKey,
      started_at: new Date(startedAt).toISOString(),
      metadata: { source: "manual_sync_now" }
    })
    .select("id")
    .single();

  if (syncRunError) throw syncRunError;
  if (!syncRun?.id) throw new Error("Unable to start Microsoft 365 usage sync.");

  const syncRunId = String(syncRun.id);
  const microsoftConfig = getAppConfig().microsoft365;
  let token: Awaited<ReturnType<typeof acquireMicrosoft365ApplicationToken>>;
  try {
    token = await acquireMicrosoft365ApplicationToken({
      tenantId: connection.provider_tenant_id,
      config: {
        clientId: microsoftConfig.clientId,
        clientSecret: microsoftConfig.clientSecret
      }
    });
  } catch (error) {
    const errorCode = normalizeMicrosoft365FailureCode(error);
    await markMicrosoft365SyncFailed({
      organizationId: context.organizationId,
      connectionId,
      syncRunId,
      startedAt,
      errorCode,
      retryCount: 0
    });
    throw new Error("Microsoft 365 synchronization could not authenticate safely.");
  }
  const snapshot = await fetchUsageInventorySnapshot({
    organization_id: context.organizationId,
    connector_type: "subscription_usage",
    provider: MICROSOFT_365_USAGE_PROVIDER,
    tenant_id: connection.provider_tenant_id,
    credential_reference: connection.credential_reference,
    provider_access_token: token.accessToken,
    page_size: 500,
    idempotency_key: idempotencyKey
  });

  if (!snapshot.ok || !snapshot.output.accepted) {
    const errorCode = snapshot.ok ? snapshot.output.warnings[0] ?? "provider_request_failed" : snapshot.errorCode;
    await markMicrosoft365SyncFailed({
      organizationId: context.organizationId,
      connectionId,
      syncRunId,
      startedAt,
      errorCode,
      retryCount: snapshot.ok ? snapshot.output.retry_count ?? 0 : 0
    });
    return snapshot;
  }

  const rows = mapMicrosoft365SnapshotToImportRows(snapshot.output);
  const assessment = assessSubscriptionUsageRows(rows, {
    sourceLabel: `Microsoft 365 tenant ${connection.provider_tenant_id}`,
    collectedAt: new Date().toISOString(),
    allowMissingPurchasedSeats: true,
    allowMissingCostCurrency: true
  });
  const batchId = await createUsageBatchWithRows({
    organizationId: context.organizationId,
    source: "microsoft_365",
    status: deriveImportBatchStatus(assessment.summary),
    fileName: null,
    idempotencyKey,
    provider: "microsoft_365",
    providerConnectionId: connectionId,
    syncRunId,
    metadata: {
      templateVersion: "subscription_usage_microsoft365_v1",
      provider: MICROSOFT_365_USAGE_PROVIDER,
      readyCount: assessment.summary.readyCount,
      rejectedCount: assessment.summary.rejectedCount,
      errorCount: assessment.summary.rejectedCount,
      partialSuccess: assessment.summary.partialSuccess,
      warningCodes: snapshot.output.warnings
    },
    rows: buildUsageRowsPayload(assessment, {
      provider: "microsoft_365",
      providerConnectionId: connectionId,
      syncRunId
    })
  });

  const reconciliation = await reconcileAndPersistUsageBatch({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    batchId,
    provider: "microsoft_365",
    providerConnectionId: connectionId,
    syncRunId,
    providerWarningCodes: snapshot.output.warnings
  });
  const findingCount = reconciliation.ok ? reconciliation.output.findings?.length ?? 0 : 0;
  const finalStatus = assessment.summary.rejectedCount > 0 || snapshot.output.partial || !reconciliation.ok ? "partial" : "completed";
  const durationMs = Date.now() - startedAt;
  await supabase
    .from("subscription_usage_sync_runs")
    .update({
      status: finalStatus,
      usage_import_batch_id: batchId,
      row_count: assessment.summary.totalRows,
      finding_count: findingCount,
      retry_count: snapshot.output.retry_count ?? 0,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
      cursor_checkpoint: snapshot.output.next_cursor,
      metadata: { warningCodes: snapshot.output.warnings },
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", syncRunId);
  await supabase
    .from("subscription_usage_provider_connections")
    .update({
      last_successful_sync_at: new Date().toISOString(),
      last_error_code: null,
      next_scheduled_sync_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", connectionId);

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.microsoft365_sync_completed",
      entityType: "subscription_usage_sync_run",
      entityId: syncRunId,
      details: sanitizeMicrosoft365OperationalMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        connectionId,
        syncRunId,
        tenantId: connection.provider_tenant_id,
        status: finalStatus,
        rowCount: assessment.summary.totalRows,
        durationMs,
        provider: MICROSOFT_365_USAGE_PROVIDER,
        warningCodes: snapshot.output.warnings
      })
    },
    { mode: "best_effort" }
  );

  revalidatePath("/dashboard/subscription-optimization");
  return { syncRunId, batchId, reconciliation };
}

async function markMicrosoft365SyncFailed(input: {
  organizationId: string;
  connectionId: string;
  syncRunId: string;
  startedAt: number;
  errorCode: string;
  retryCount: number;
}) {
  const supabase = createSubscriptionUsageSupabaseClient();
  const durationMs = Date.now() - input.startedAt;
  const status = input.errorCode === "unauthorized" || input.errorCode === "permission_error"
    ? "permission_error"
    : input.errorCode === "expired_credential"
      ? "expired_credential"
      : input.errorCode === "tenant_mismatch"
        ? "tenant_mismatch"
        : input.errorCode === "verification_failed"
          ? "verification_failed"
          : "connected";
  await Promise.all([
    supabase
      .from("subscription_usage_sync_runs")
      .update({
        status: "failed",
        failed_at: new Date().toISOString(),
        duration_ms: durationMs,
        retry_count: input.retryCount,
        provider_error_category: input.errorCode,
        last_error_code: input.errorCode,
        updated_at: new Date().toISOString()
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.syncRunId),
    supabase
      .from("subscription_usage_provider_connections")
      .update({
        status,
        last_error_code: input.errorCode,
        next_scheduled_sync_at: status === "connected" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq("organization_id", input.organizationId)
      .eq("id", input.connectionId)
  ]);
  void emitOperationalEvent({
    eventName: "subscription_usage.microsoft365_sync_failed",
    severity: status === "permission_error" ? "P2" : "P3",
    sensitivity: "customer_sensitive",
    alert: status === "permission_error",
    organizationId: input.organizationId,
    action: "subscription_usage_sync",
    metadata: sanitizeMicrosoft365OperationalMetadata({
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      syncRunId: input.syncRunId,
      provider: MICROSOFT_365_USAGE_PROVIDER,
      status,
      lastErrorCode: input.errorCode,
      retryCount: input.retryCount,
      durationMs
    })
  });
}

function normalizeMicrosoft365FailureCode(error: unknown) {
  const code = error instanceof Error ? error.message : "verification_failed";
  return [
    "permission_error",
    "expired_credential",
    "tenant_mismatch",
    "verification_failed",
    "provider_unavailable",
    "provider_timeout",
    "provider_request_failed"
  ].includes(code) ? code : "verification_failed";
}

function deriveImportBatchStatus(summary: SubscriptionUsageImportAssessment["summary"]) {
  if (summary.readyCount === 0 && summary.needsReviewCount === 0) return "failed";
  if (summary.rejectedCount > 0 || summary.needsReviewCount > 0 || summary.partialSuccess) return "partial";
  return "completed";
}

function buildUsageRowsPayload(
  assessment: SubscriptionUsageImportAssessment,
  context: {
    provider: "manual_csv" | "microsoft_365" | "google_workspace";
    providerConnectionId?: string | null;
    syncRunId?: string | null;
  }
) {
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
    provider: context.provider,
    provider_connection_id: context.providerConnectionId ?? null,
    sync_run_id: context.syncRunId ?? null,
    external_product_id: row.normalized.contractReference,
    normalized_payload: {
      category: row.normalized.category,
      department: row.normalized.department,
      contractReference: row.normalized.contractReference
    }
  }));
}

async function createUsageBatchWithRows(input: {
  organizationId: string;
  source: string;
  status: "completed" | "partial" | "failed";
  fileName: string | null;
  idempotencyKey: string;
  provider: "manual_csv" | "microsoft_365" | "google_workspace";
  providerConnectionId?: string | null;
  syncRunId?: string | null;
  metadata: Record<string, unknown>;
  rows: Record<string, unknown>[];
}) {
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data, error } = await supabase.rpc("create_subscription_usage_batch_with_rows", {
    p_organization_id: input.organizationId,
    p_source: input.source,
    p_status: input.status,
    p_file_name: input.fileName,
    p_idempotency_key: input.idempotencyKey,
    p_provider: input.provider,
    p_provider_connection_id: input.providerConnectionId ?? null,
    p_sync_run_id: input.syncRunId ?? null,
    p_metadata: input.metadata,
    p_rows: input.rows
  });

  if (error) throw error;
  if (!data) throw new Error("Unable to persist subscription usage batch.");
  return String(data);
}

export async function previewSubscriptionUsageImportAction(formData: FormData): Promise<SubscriptionUsageImportPreview> {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_import_preview" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  if (!(file instanceof File)) throw new Error("A CSV or XLSX usage file is required.");
  if (!sourceLabel) throw new Error("A source label is required.");

  const rows = parseSubscriptionUsageImportFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (rows.length > MAX_USAGE_IMPORT_ROWS) {
    throw new Error(`Usage imports are limited to ${MAX_USAGE_IMPORT_ROWS} rows in the starter workflow.`);
  }

  const assessment = assessSubscriptionUsageRows(rows, { sourceLabel });
  const idempotencyKey = buildSubscriptionUsageImportIdempotencyKey({
    organizationId: context.organizationId,
    fileName: file.name,
    rowHashes: assessment.rows.map((row) => row.normalized.sourceRowHash)
  });

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.import_previewed",
      entityType: "subscription_usage_import_batch",
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        issueCodes: [...new Set(assessment.rows.flatMap((row) => row.issues.map((issue) => issue.code)))]
      })
    },
    { mode: "best_effort" }
  );

  return { assessment, idempotencyKey };
}

export async function commitSubscriptionUsageImportAction(formData: FormData) {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_import_commit" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  const file = formData.get("file");
  const sourceLabel = String(formData.get("sourceLabel") ?? "").trim();
  if (!(file instanceof File)) throw new Error("A CSV or XLSX usage file is required.");
  if (!sourceLabel) throw new Error("A source label is required.");

  const rows = parseSubscriptionUsageImportFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (rows.length > MAX_USAGE_IMPORT_ROWS) throw new Error(`Usage imports are limited to ${MAX_USAGE_IMPORT_ROWS} rows.`);

  const assessment = assessSubscriptionUsageRows(rows, { sourceLabel });
  const idempotencyKey = buildSubscriptionUsageImportIdempotencyKey({
    organizationId: context.organizationId,
    fileName: file.name,
    rowHashes: assessment.rows.map((row) => row.normalized.sourceRowHash)
  });

  const batchId = await createUsageBatchWithRows({
    organizationId: context.organizationId,
    source: sourceLabel,
    status: deriveImportBatchStatus(assessment.summary),
    fileName: file.name,
    idempotencyKey,
    provider: "manual_csv",
    metadata: {
      templateVersion: "subscription_usage_v1",
      needsReviewCount: assessment.summary.needsReviewCount,
      duplicateCount: assessment.summary.duplicateCount,
      sampleCount: assessment.summary.sampleCount,
      errorCount: assessment.summary.rejectedCount,
      readyCount: assessment.summary.readyCount,
      rejectedCount: assessment.summary.rejectedCount,
      partialSuccess: assessment.summary.partialSuccess
    },
    rows: buildUsageRowsPayload(assessment, { provider: "manual_csv" })
  });

  await createAuditLog(
    {
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "subscription_usage.import_committed",
      entityType: "subscription_usage_import_batch",
      entityId: batchId,
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: context.organizationId,
        actorUserId: context.user.id,
        batchId,
        issueCodes: [...new Set(assessment.rows.flatMap((row) => row.issues.map((issue) => issue.code)))]
      })
    },
    { mode: "best_effort" }
  );

  revalidatePath("/dashboard/subscription-optimization");
  const reconciliation = await reconcileAndPersistUsageBatch({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    batchId,
    provider: "manual_csv"
  });

  return { batchId, assessment, reconciliation };
}

async function reconcileAndPersistUsageBatch(input: {
  organizationId: string;
  actorUserId: string;
  batchId: string;
  provider: "manual_csv" | "microsoft_365" | "google_workspace";
  providerConnectionId?: string | null;
  syncRunId?: string | null;
  providerWarningCodes?: string[];
  includeManualImports?: boolean;
}) {
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: scopeData, error: scopeError } = await supabase.rpc("create_subscription_usage_analysis_scope", {
    p_organization_id: input.organizationId,
    p_current_batch_id: input.batchId,
    p_include_manual_imports: input.includeManualImports ?? input.provider === "manual_csv"
  });
  if (scopeError) throw scopeError;
  const scope = parseSubscriptionUsageAnalysisScope(scopeData);
  const [rows, contractCandidates] = await Promise.all([
    loadAnalysisUsageRows(supabase, input.organizationId, scope.batchIds),
    loadContractCandidates(input.organizationId)
  ]);

  const result = await reconcileUsage({
    organization_id: input.organizationId,
    usage_import_batch_id: input.batchId,
    matching_mode: "balanced",
    normalized_rows: rows.map((row: SubscriptionUsageRowRecord) => ({
      usage_row_id: row.id,
      vendor: row.vendor_name ?? "",
      product: row.product_name ?? "",
      normalized_product: row.normalized_product ?? "",
      provider: row.provider ?? "manual_csv",
      external_product_id: row.external_product_id ?? null,
      category: row.product_category ?? null,
      annual_reviewed_cost: row.annual_reviewed_cost ?? null,
      currency: row.currency ?? null,
      purchased_seats: row.purchased_seats ?? null,
      assigned_seats: row.assigned_seats ?? null,
      active_users_30d: row.active_users_30d ?? null,
      active_users_90d: row.active_users_90d ?? null,
      last_activity_at: row.last_activity_at ?? null,
      collected_at: row.collected_at ?? null,
      trust_state: row.trust_state ?? null,
      confidence: row.confidence ?? null,
      is_sample: row.is_sample ?? false,
      department: row.department ?? null
    })),
    contract_candidates: contractCandidates,
    provider_warning_codes: [...new Set([...(input.providerWarningCodes ?? []), ...scope.warningCodes])]
  });

  if (!result.ok) return result;

  await persistUsageFindings({
    organizationId: input.organizationId,
    batchId: input.batchId,
    provider: input.provider,
    providerConnectionId: input.providerConnectionId ?? null,
    syncRunId: input.syncRunId ?? null,
    analysisScope: scope,
    output: result.output
  });

  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "subscription_usage.reconciliation_completed",
      entityType: "usage_import_batch",
      entityId: input.batchId,
      details: sanitizeSubscriptionUsageAuditMetadata({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        batchId: input.batchId,
        analysisScopeId: scope.analysisScopeId,
        estimatedSavings: result.output.estimated_savings
      })
    },
    { mode: "best_effort" }
  );

  return result;
}

function parseSubscriptionUsageAnalysisScope(value: unknown): SubscriptionUsageAnalysisScope {
  if (!value || typeof value !== "object") throw new Error("subscription_usage_analysis_scope_invalid");
  const candidate = value as Partial<SubscriptionUsageAnalysisScope>;
  if (
    typeof candidate.analysisScopeId !== "string" ||
    typeof candidate.scopeKey !== "string" ||
    typeof candidate.scopeFamilyKey !== "string" ||
    !Array.isArray(candidate.batchIds) || candidate.batchIds.length === 0 ||
    candidate.batchIds.some((id) => typeof id !== "string") ||
    !Array.isArray(candidate.providers)
  ) {
    throw new Error("subscription_usage_analysis_scope_invalid");
  }
  return {
    analysisScopeId: candidate.analysisScopeId,
    scopeKey: candidate.scopeKey,
    scopeFamilyKey: candidate.scopeFamilyKey,
    batchIds: candidate.batchIds as string[],
    providers: candidate.providers.filter((provider): provider is string => typeof provider === "string"),
    warningCodes: Array.isArray(candidate.warningCodes)
      ? candidate.warningCodes.filter((code): code is string => typeof code === "string")
      : []
  };
}

async function loadAnalysisUsageRows(
  supabase: SubscriptionUsageSupabaseClient,
  organizationId: string,
  batchIds: string[]
) {
  const rows: SubscriptionUsageRowRecord[] = [];
  for (let offset = 0; offset <= MAX_ANALYSIS_USAGE_ROWS; offset += ANALYSIS_USAGE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("usage_import_rows")
      .select("id, vendor_name, product_name, normalized_product, product_category, annual_reviewed_cost, currency, purchased_seats, assigned_seats, active_users_30d, active_users_90d, last_activity_at, collected_at, trust_state, confidence, is_sample, provider, external_product_id, department")
      .eq("organization_id", organizationId)
      .in("batch_id", batchIds)
      .in("validation_status", ["ready", "needs_review"])
      .order("id", { ascending: true })
      .range(offset, offset + ANALYSIS_USAGE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < ANALYSIS_USAGE_PAGE_SIZE) return rows;
    if (rows.length >= MAX_ANALYSIS_USAGE_ROWS) {
      throw new Error("subscription_usage_analysis_scope_too_large");
    }
  }
  throw new Error("subscription_usage_analysis_scope_too_large");
}

async function loadContractCandidates(organizationId: string) {
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(`
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

  if (error) throw error;
  if ((data ?? []).length > 1000) {
    throw new Error("subscription_usage_contract_candidate_scope_too_large");
  }

  return (data ?? []).map((contract: SubscriptionUsageContractRecord) => {
    const metadata = Array.isArray(contract.contract_metadata)
      ? contract.contract_metadata[0] ?? null
      : contract.contract_metadata;
    return {
      contract_id: contract.id,
      vendor: metadata?.counterparty_name ?? null,
      title: metadata?.contract_title ?? null,
      renewal_date: metadata?.renewal_date ?? null,
      notice_deadline_date: metadata?.notice_deadline_date ?? null,
      annual_cost: metadata?.contract_value_amount ?? null,
      currency: metadata?.contract_value_currency ?? null,
      is_sample: contract.is_sample ?? false
    };
  });
}

async function persistUsageFindings(input: {
  organizationId: string;
  batchId: string;
  provider: "manual_csv" | "microsoft_365" | "google_workspace";
  providerConnectionId: string | null;
  syncRunId: string | null;
  analysisScope: SubscriptionUsageAnalysisScope;
  output: ReconcileUsageResponse;
}) {
  const findings = input.output.findings ?? [];
  const supabase = createSubscriptionUsageSupabaseClient();
  const payload = findings.map((finding) => {
    const logicalOpportunityKey = buildLogicalOpportunityKey(input.organizationId, input.analysisScope.scopeFamilyKey, finding);
    const evidence = {
      reasonCode: finding.reason_code,
      warnings: finding.warnings,
      matchedContractCount: finding.matched_contract_ids.length,
      usageEvidence: finding.evidence ?? {},
      explanation: finding.explanation ?? null,
      recommendedHumanAction: finding.recommended_human_action ?? null,
      analysisScopeId: input.analysisScope.analysisScopeId,
      snapshotBatchIds: input.analysisScope.batchIds,
      providerSet: input.analysisScope.providers
    };
    return {
      contract_id: finding.matched_contract_ids[0] ?? null,
      finding_fingerprint: buildFindingFingerprint(input.organizationId, finding.finding_type, finding.reason_code, finding.source_row_ids, finding.matched_contract_ids, finding.fingerprint_key),
      logical_opportunity_key: logicalOpportunityKey,
      evidence_hash: crypto.createHash("sha256").update(JSON.stringify({
        sourceRowIds: [...finding.source_row_ids].sort(),
        matchedContractIds: [...finding.matched_contract_ids].sort(),
        warnings: [...finding.warnings].sort(),
        confidence: finding.confidence,
        estimatedSavings: finding.estimated_savings,
        evidence
      })).digest("hex"),
      finding_type: finding.finding_type,
      reason_code: finding.reason_code,
      calculation_version: finding.calculation_version,
      usage_row_ids: finding.source_row_ids,
      matched_contract_ids: finding.matched_contract_ids,
      utilization: finding.utilization,
      unused_seats: finding.unused_seats,
      confidence: finding.confidence,
      warnings: finding.warnings,
      estimated_savings: finding.estimated_savings,
      currency: finding.currency,
      recommended_action: finding.recommended_action,
      capability_category: finding.capability_category ?? null,
      taxonomy_version: finding.taxonomy_version ?? null,
      involved_providers: finding.involved_providers ?? [],
      involved_products: finding.involved_products ?? [],
      estimated_savings_min: finding.estimated_savings_min ?? null,
      estimated_savings_max: finding.estimated_savings_max ?? null,
      evidence
    };
  });
  const { data, error } = await supabase.rpc("persist_subscription_usage_analysis_findings", {
    p_organization_id: input.organizationId,
    p_analysis_scope_id: input.analysisScope.analysisScopeId,
    p_batch_id: input.batchId,
    p_provider: input.provider,
    p_provider_connection_id: input.providerConnectionId,
    p_sync_run_id: input.syncRunId,
    p_findings: payload
  });
  if (error) throw error;
  return { persisted: Number(data ?? 0) };
}

function buildLogicalOpportunityKey(
  organizationId: string,
  scopeFamilyKey: string,
  finding: NonNullable<ReconcileUsageResponse["findings"]>[number]
) {
  return crypto.createHash("sha256").update(JSON.stringify({
    organizationId,
    scopeFamilyKey,
    findingType: finding.finding_type,
    reasonCode: finding.reason_code,
    stableFindingKey: finding.fingerprint_key ?? null,
    involvedProviders: [...(finding.involved_providers ?? [])].sort(),
    involvedProducts: [...(finding.involved_products ?? [])].sort(),
    matchedContractIds: [...finding.matched_contract_ids].sort()
  })).digest("hex");
}

function buildFindingFingerprint(
  organizationId: string,
  findingType: string,
  reasonCode: string,
  sourceRowIds: string[],
  matchedContractIds: string[],
  stableFindingKey?: string | null
) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      organizationId,
      findingType,
      reasonCode,
      stableFindingKey: stableFindingKey ?? null,
      sourceRowIds: stableFindingKey ? [] : [...sourceRowIds].sort(),
      matchedContractIds: [...matchedContractIds].sort()
    }))
    .digest("hex");
}

export async function runSubscriptionUsageReconciliationAction(batchId: string) {
  const context = await requireOrganization();
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_reconciliation" }
  });
  await assertSubscriptionUsageOptimizationReady(context.organizationId);

  return reconcileAndPersistUsageBatch({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    batchId,
    provider: "manual_csv"
  });
}

export async function reviewSubscriptionUsageFindingAction(formData: FormData) {
  const context = await requireOrganization();
  if (!["owner", "admin", "operator", "reviewer"].includes(context.role)) {
    throw new Error("Only organization review roles can review subscription recommendations.");
  }
  await enforceFeatureAccess({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    feature: "subscription_usage_optimization",
    context: { source: "subscription_usage_finding_review" }
  });
  const findingId = String(formData.get("findingId") ?? "").trim();
  const nextStatus = String(formData.get("nextStatus") ?? "") as "accepted" | "rejected" | "deferred" | "action_planned";
  const acceptedAction = String(formData.get("acceptedAction") ?? "").trim() || null;
  const feedbackClassification = String(formData.get("feedbackClassification") ?? "").trim() || null;
  const feedbackReason = String(formData.get("feedbackReason") ?? "").trim() || null;
  if (!findingId || !["accepted", "rejected", "deferred", "action_planned"].includes(nextStatus)) {
    throw new Error("A valid recommendation review decision is required.");
  }
  if (feedbackClassification && !["correct", "incorrect", "requires_help"].includes(feedbackClassification)) {
    throw new Error("Recommendation feedback classification is invalid.");
  }
  if (feedbackReason && ![
    "separate_departments", "compliance_requirement", "migration_in_progress", "backup_requirement",
    "incorrect_product_mapping", "insufficient_evidence", "other"
  ].includes(feedbackReason)) {
    throw new Error("Recommendation feedback reason is invalid.");
  }
  if (acceptedAction && ![
    "retain", "reduce_seats", "consolidate", "terminate", "renegotiate", "investigate", "insufficient_evidence"
  ].includes(acceptedAction)) {
    throw new Error("Recommendation action is invalid.");
  }
  const supabase = createSubscriptionUsageSupabaseClient();
  const { data: finding, error: findingError } = await supabase
    .from("license_waste_opportunities")
    .select("id, finding_fingerprint, review_status, provider")
    .eq("organization_id", context.organizationId)
    .eq("id", findingId)
    .maybeSingle();
  if (findingError) throw findingError;
  if (!finding) throw new Error("Recommendation was not found for this organization.");

  const decision = prepareSubscriptionUsageFindingReview({
    findingId,
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    nextStatus,
    acceptedAction: acceptedAction as "retain" | "reduce_seats" | "consolidate" | "terminate" | "renegotiate" | "investigate" | "insufficient_evidence" | null,
    feedbackClassification: feedbackClassification as "correct" | "incorrect" | "requires_help" | null,
    feedbackReason: feedbackReason as "separate_departments" | "compliance_requirement" | "migration_in_progress" | "backup_requirement" | "incorrect_product_mapping" | "insufficient_evidence" | "other" | null
  });
  if (!decision.allowed) throw new Error(decision.safeMessage);
  const { error } = await supabase
    .from("license_waste_opportunities")
    .update({
      review_status: decision.reviewStatus,
      accepted_action: decision.acceptedAction,
      feedback_classification: feedbackClassification,
      feedback_reason: feedbackReason,
      reviewed_by_user_id: context.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq("organization_id", context.organizationId)
    .eq("id", findingId);
  if (error) throw error;
  await createAuditLog({
    organizationId: context.organizationId,
    actorUserId: context.user.id,
    action: "subscription_usage.finding_reviewed",
    entityType: "license_waste_opportunity",
    entityId: findingId,
    details: sanitizeSubscriptionUsageAuditMetadata(decision.auditMetadata)
  });
  revalidatePath("/dashboard/subscription-optimization");
}
