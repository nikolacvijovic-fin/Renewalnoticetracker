import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildGoogleWorkspaceAuthorizationUrl,
  buildGoogleWorkspaceConnectionRecord,
  buildGoogleWorkspaceSyncIdempotencyKey,
  decryptGoogleWorkspaceCredential,
  encryptGoogleWorkspaceCredential,
  exchangeGoogleWorkspaceAuthorizationCode,
  GOOGLE_WORKSPACE_REQUIRED_SCOPES,
  mapGoogleWorkspaceSnapshotToImportRows,
  normalizeGoogleWorkspaceFailureCode,
  refreshGoogleWorkspaceAccessToken,
  sanitizeGoogleWorkspaceOperationalMetadata,
  verifyGoogleWorkspaceAuthorizationState
} from "@/lib/subscription-usage/google-workspace";
import {
  getProductCapabilities,
  SUBSCRIPTION_CAPABILITIES,
  SUBSCRIPTION_CAPABILITY_TAXONOMY_VERSION
} from "@/lib/subscription-usage/capability-taxonomy";
import { canManageSubscriptionUsageConnection } from "@/lib/subscription-usage/microsoft365";

const config = {
  clientId: "google-client",
  clientSecret: "google-secret",
  redirectUri: "https://app.example.com/api/subscription-usage/google-workspace/callback",
  signingSecret: "state-secret",
  credentialEncryptionKey: "credential-encryption-secret-with-32-chars"
};

describe("Google Workspace subscription usage connector boundary", () => {
  it("builds a signed least-privilege administrator authorization URL", () => {
    const issuedAt = "2026-08-17T10:00:00.000Z";
    const state = { organizationId: "org-1", actorUserId: "user-1", customerId: "C01234567", domain: "example.com", nonce: "nonce-1", issuedAt };
    const result = buildGoogleWorkspaceAuthorizationUrl({ config, state });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("authorization url expected");
    const url = new URL(result.url);
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(GOOGLE_WORKSPACE_REQUIRED_SCOPES);
    expect(verifyGoogleWorkspaceAuthorizationState(url.searchParams.get("state") ?? "", config.signingSecret, new Date("2026-08-17T10:05:00.000Z"))).toEqual(state);
    expect(verifyGoogleWorkspaceAuthorizationState(`${url.searchParams.get("state")}tampered`, config.signingSecret, new Date("2026-08-17T10:05:00.000Z"))).toBeNull();
    expect(verifyGoogleWorkspaceAuthorizationState(url.searchParams.get("state") ?? "", config.signingSecret, new Date("2026-08-17T10:20:00.000Z"))).toBeNull();
  });

  it("exchanges authorization codes without returning raw provider payloads", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ access_token: "SHORT_LIVED", refresh_token: "REFRESH_SECRET", provider_payload: "hidden" }), { status: 200, headers: { "content-type": "application/json" } }));
    const result = await exchangeGoogleWorkspaceAuthorizationCode({ code: "authorization-code", config, fetchImpl });
    expect(result).toEqual({ refreshToken: "REFRESH_SECRET" });
    expect(result).not.toHaveProperty("accessToken");
    expect(result).not.toHaveProperty("provider_payload");
  });

  it("classifies revoked and timed-out token refreshes without exposing credentials", async () => {
    const encryptedRefreshToken = encryptGoogleWorkspaceCredential("REFRESH_SECRET", config.credentialEncryptionKey);
    await expect(refreshGoogleWorkspaceAccessToken({
      encryptedRefreshToken,
      config,
      fetchImpl: vi.fn(async () => new Response("{\"error\":\"raw provider payload\"}", { status: 401 })) as unknown as typeof fetch
    })).rejects.toThrow("revoked_access");
    const timeout = new Error("request aborted with token REFRESH_SECRET");
    timeout.name = "AbortError";
    await expect(refreshGoogleWorkspaceAccessToken({
      encryptedRefreshToken,
      config,
      fetchImpl: vi.fn(async () => { throw timeout; }) as unknown as typeof fetch
    })).rejects.toThrow("google_token_request_timeout");
  });

  it("stores only a managed reference publicly and encrypts the refresh credential", () => {
    const connection = buildGoogleWorkspaceConnectionRecord({ organizationId: "org-1", actorUserId: "user-1", customerId: "C01234567", domain: "Example.COM" });
    const envelope = encryptGoogleWorkspaceCredential("REFRESH_TOKEN_SHOULD_NOT_BE_PLAINTEXT", config.credentialEncryptionKey);
    expect(connection).toEqual(expect.objectContaining({ provider: "google_workspace", customerId: "C01234567", domain: "example.com", credentialReference: "managed-secret:google-workspace:org-1:C01234567" }));
    expect(JSON.stringify(connection)).not.toMatch(/REFRESH_TOKEN|access_token|authorization_code/i);
    expect(envelope).not.toContain("REFRESH_TOKEN_SHOULD_NOT_BE_PLAINTEXT");
    expect(decryptGoogleWorkspaceCredential(envelope, config.credentialEncryptionKey)).toBe("REFRESH_TOKEN_SHOULD_NOT_BE_PLAINTEXT");
  });

  it("keeps connection management role-scoped and sync keys deterministic", () => {
    expect(canManageSubscriptionUsageConnection("owner")).toBe(true);
    expect(canManageSubscriptionUsageConnection("admin")).toBe(true);
    expect(canManageSubscriptionUsageConnection("operator")).toBe(true);
    expect(canManageSubscriptionUsageConnection("reviewer")).toBe(false);
    const first = buildGoogleWorkspaceSyncIdempotencyKey({ organizationId: "org-1", connectionId: "connection-1", collectedAt: "2026-08-17T01:00:00Z" });
    const repeated = buildGoogleWorkspaceSyncIdempotencyKey({ organizationId: "org-1", connectionId: "connection-1", collectedAt: "2026-08-17T20:00:00Z" });
    const anotherOrganization = buildGoogleWorkspaceSyncIdempotencyKey({ organizationId: "org-2", connectionId: "connection-1", collectedAt: "2026-08-17T20:00:00Z" });
    expect(repeated).toBe(first);
    expect(anotherOrganization).not.toBe(first);
  });

  it("normalizes Google snapshot rows without individual identities or provider payloads", () => {
    const rows = mapGoogleWorkspaceSnapshotToImportRows({
      accepted: true,
      connector_type: "subscription_usage",
      records: [{ external_product_id: "sku-1", vendor: "Google", product: "Google Workspace Business Standard", category: "productivity_suite", purchased_seats: 20, assigned_seats: 20, active_users_30d: 8, active_users_90d: 15, collected_at: "2026-08-17T00:00:00Z", source_label: "Google Admin APIs", warning_codes: ["activity_uses_account_login_proxy"] }],
      next_cursor: null,
      warnings: ["activity_uses_account_login_proxy"],
      retry_count: 1,
      partial: true
    });
    expect(rows[0]).toEqual(expect.objectContaining({ vendor: "Google", purchased_seats: 20, active_users_30d: 8, contract_reference: "sku-1" }));
    expect(JSON.stringify(rows)).not.toMatch(/userEmail|primaryEmail|Bearer|provider_payload/i);
  });

  it("uses a versioned reviewable taxonomy for every required capability", () => {
    expect(SUBSCRIPTION_CAPABILITY_TAXONOMY_VERSION).toBe("subscription_capability_taxonomy_v1");
    expect(SUBSCRIPTION_CAPABILITIES).toEqual(expect.arrayContaining(["email_calendar", "video_meetings", "team_chat", "file_collaboration", "office_editing", "identity_access", "device_management", "security_compliance"]));
    expect(getProductCapabilities("microsoft_365", "Microsoft Teams").map((item) => item.capability)).toEqual(expect.arrayContaining(["video_meetings", "team_chat"]));
    expect(getProductCapabilities("google_workspace", "Google Workspace Business Standard").map((item) => item.capability)).toContain("email_calendar");
  });

  it("keeps operational metadata allowlisted and token-free", () => {
    const safe = sanitizeGoogleWorkspaceOperationalMetadata({ organizationId: "org-1", connectionId: "conn-1", domain: "example.com", status: "failed", lastErrorCode: "provider_timeout", refreshToken: "MUST_NOT_SURVIVE", providerPayload: { raw: true }, warningCodes: ["access token leaked"] });
    expect(safe).toEqual({ organizationId: "org-1", connectionId: "conn-1", domain: "example.com", status: "failed", lastErrorCode: "provider_timeout", warningCodes: ["[redacted]"] });
    expect(JSON.stringify(safe)).not.toMatch(/MUST_NOT_SURVIVE|providerPayload|raw/i);
    expect(normalizeGoogleWorkspaceFailureCode("provider_timeout")).toBe("provider_timeout");
    expect(normalizeGoogleWorkspaceFailureCode("raw token from provider")).toBe("provider_request_failed");
  });

  it("migration extends provider RLS and keeps credentials service-role only", () => {
    const migration = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "202608170002_google_workspace_overlap_optimization.sql"), "utf8");
    const foundation = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "202608170001_microsoft365_subscription_usage_connector.sql"), "utf8");
    expect(migration).toContain("'google_workspace'");
    expect(migration).toContain("subscription_usage_provider_credentials");
    expect(migration).toContain("revoke all on table public.subscription_usage_provider_credentials from public, anon, authenticated");
    expect(migration).toContain("capability_category");
    expect(migration).toContain("feedback_reason");
    expect(migration).toContain("disconnect_google_workspace_subscription_usage_connection");
    expect(migration).toContain("and provider = 'google_workspace'");
    expect(migration).toContain("m.user_id = auth.uid()");
    expect(migration).toContain("m.role in ('owner', 'admin', 'operator')");
    expect(foundation).toContain("unique (organization_id, provider_connection_id, idempotency_key)");
    expect(foundation).toContain("operator roles can manage subscription usage provider connections");
    expect(foundation).toContain("operator roles can manage subscription usage sync runs");
    expect(foundation).toContain("m.user_id = auth.uid()");
  });

  it("uses only the approved repository for privileged credential access", () => {
    const action = fs.readFileSync(path.join(process.cwd(), "lib", "actions", "subscription-usage-optimization.ts"), "utf8");
    const repository = fs.readFileSync(path.join(process.cwd(), "lib", "subscription-usage", "repositories", "admin-provider-credentials-repository.ts"), "utf8");
    expect(action).not.toContain("createAdminSupabaseClient");
    expect(repository).toContain("createAdminSupabaseClient");
    expect(repository).toContain("organization_id");
  });

  it("attributes provider sync failures to the correct sanitized operational event", () => {
    const action = fs.readFileSync(path.join(process.cwd(), "lib", "actions", "subscription-usage-optimization.ts"), "utf8");
    const googleFailure = action.slice(
      action.indexOf("async function markGoogleWorkspaceSyncFailed"),
      action.indexOf("export async function syncMicrosoft365UsageNowAction")
    );
    const microsoftFailure = action.slice(
      action.indexOf("async function markMicrosoft365SyncFailed"),
      action.indexOf("function deriveImportBatchStatus")
    );
    expect(googleFailure).toContain('eventName: "subscription_usage.google_workspace_sync_failed"');
    expect(googleFailure).toContain("sanitizeGoogleWorkspaceOperationalMetadata");
    expect(googleFailure).not.toContain("microsoft365_sync_failed");
    expect(microsoftFailure).toContain('eventName: "subscription_usage.microsoft365_sync_failed"');
    expect(microsoftFailure).toContain("sanitizeMicrosoft365OperationalMetadata");
    expect(microsoftFailure).not.toContain("google_workspace_sync_failed");
  });

  it("documents exact permissions, limitations, and disconnect retention", () => {
    const docs = fs.readFileSync(path.join(process.cwd(), "docs", "GOOGLE_WORKSPACE_SUBSCRIPTION_USAGE_CONNECTOR.md"), "utf8");
    expect(docs).toContain("https://www.googleapis.com/auth/apps.licensing");
    expect(docs).toContain("https://www.googleapis.com/auth/admin.reports.usage.readonly");
    expect(docs).toContain("Directory scope is not requested");
    expect(docs).toContain("Disconnect immediately deletes the encrypted credential");
    expect(docs).toContain("never proof of equivalence");
  });
});
