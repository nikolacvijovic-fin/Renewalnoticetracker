import crypto from "node:crypto";
import type { UsageInventoryConnectorResult } from "@/lib/add-ons/java-enterprise-client";
import type { SubscriptionUsageImportRow } from "@/lib/subscription-usage/types";

export const GOOGLE_WORKSPACE_USAGE_PROVIDER = "google_workspace" as const;
export const GOOGLE_WORKSPACE_REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/apps.licensing",
  "https://www.googleapis.com/auth/admin.reports.usage.readonly"
] as const;

export type GoogleWorkspaceAuthorizationState = {
  organizationId: string;
  actorUserId: string;
  customerId: string;
  domain: string;
  nonce: string;
  issuedAt: string;
};

export type GoogleWorkspaceConnectionStatus =
  | "pending_admin_consent"
  | "connected"
  | "permission_error"
  | "expired_credential"
  | "revoked_access"
  | "disconnected";

export type GoogleWorkspaceOAuthConfig = {
  clientId: string | null;
  clientSecret: string | null;
  redirectUri: string | null;
  signingSecret: string | null;
  credentialEncryptionKey: string | null;
};

export function buildGoogleWorkspaceAuthorizationUrl(input: {
  config: GoogleWorkspaceOAuthConfig;
  state: GoogleWorkspaceAuthorizationState;
}) {
  const missing = getMissingGoogleWorkspaceConfig(input.config);
  if (missing) return missing;
  const scope = normalizeGoogleWorkspaceScope(input.state);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", input.config.clientId!);
  url.searchParams.set("redirect_uri", input.config.redirectUri!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_WORKSPACE_REQUIRED_SCOPES.join(" "));
  url.searchParams.set("state", signGoogleWorkspaceAuthorizationState({ ...input.state, ...scope }, input.config.signingSecret!));
  return { ok: true as const, url: url.toString() };
}

export function signGoogleWorkspaceAuthorizationState(state: GoogleWorkspaceAuthorizationState, secret: string) {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyGoogleWorkspaceAuthorizationState(value: string, secret: string, now = new Date()) {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const state = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as GoogleWorkspaceAuthorizationState;
    if (!state.organizationId || !state.actorUserId || !state.customerId || !state.domain || !state.nonce || !state.issuedAt) return null;
    const ageMs = now.getTime() - new Date(state.issuedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15 * 60 * 1000) return null;
    return state;
  } catch {
    return null;
  }
}

export function normalizeGoogleWorkspaceScope(input: { customerId: string; domain: string }) {
  const customerId = input.customerId.trim();
  const domain = input.domain.trim().toLowerCase();
  if (!/^(?:C[a-zA-Z0-9_-]{4,63}|my_customer)$/.test(customerId)) {
    throw new Error("Google Workspace customer ID is invalid.");
  }
  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    throw new Error("Google Workspace domain is invalid.");
  }
  return { customerId, domain };
}

export function buildGoogleWorkspaceConnectionRecord(input: {
  organizationId: string;
  actorUserId: string;
  customerId: string;
  domain: string;
}) {
  const scope = normalizeGoogleWorkspaceScope(input);
  const credentialReference = `managed-secret:google-workspace:${input.organizationId}:${scope.customerId}`;
  return {
    provider: GOOGLE_WORKSPACE_USAGE_PROVIDER,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    customerId: scope.customerId,
    domain: scope.domain,
    status: "connected" as const,
    credentialReference,
    credentialFingerprint: hashStable(`google:${input.organizationId}:${scope.customerId}`).slice(0, 16),
    requiredPermissions: [...GOOGLE_WORKSPACE_REQUIRED_SCOPES]
  };
}

export async function exchangeGoogleWorkspaceAuthorizationCode(input: {
  code: string;
  config: GoogleWorkspaceOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  const missing = getMissingGoogleWorkspaceConfig(input.config);
  if (missing) throw new Error(missing.safeMessage);
  if (!input.code.trim()) throw new Error("Google Workspace authorization code is missing.");
  const response = await fetchGoogleToken(input.fetchImpl ?? fetch, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.clientId!,
      client_secret: input.config.clientSecret!,
      redirect_uri: input.config.redirectUri!,
      grant_type: "authorization_code"
    })
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.refresh_token !== "string" || !payload.refresh_token) {
    throw new Error(response.status === 401 || response.status === 403 ? "google_authorization_denied" : "google_token_exchange_failed");
  }
  const grantedScopes = parseGrantedGoogleScopes(payload.scope);
  assertRequiredGoogleScopes(grantedScopes);
  return { refreshToken: payload.refresh_token, grantedScopes };
}

export async function refreshGoogleWorkspaceAccessToken(input: {
  encryptedRefreshToken: string;
  config: GoogleWorkspaceOAuthConfig;
  fetchImpl?: typeof fetch;
}) {
  if (!input.config.clientId || !input.config.clientSecret || !input.config.credentialEncryptionKey) {
    throw new Error("google_workspace_credentials_not_configured");
  }
  const refreshToken = decryptGoogleWorkspaceCredential(input.encryptedRefreshToken, input.config.credentialEncryptionKey);
  const response = await fetchGoogleToken(input.fetchImpl ?? fetch, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: input.config.clientId,
      client_secret: input.config.clientSecret,
      grant_type: "refresh_token"
    })
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error(response.status === 401 || response.status === 403 ? "revoked_access" : "google_token_refresh_failed");
  }
  if (payload.scope !== undefined) assertRequiredGoogleScopes(parseGrantedGoogleScopes(payload.scope));
  return payload.access_token;
}

export function encryptGoogleWorkspaceCredential(value: string, secret: string) {
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptGoogleWorkspaceCredential(envelope: string, secret: string) {
  const [version, iv, tag, ciphertext] = envelope.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("invalid_google_credential_envelope");
  const key = crypto.createHash("sha256").update(secret).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function mapGoogleWorkspaceSnapshotToImportRows(result: UsageInventoryConnectorResult): SubscriptionUsageImportRow[] {
  return result.records.map((record) => ({
    vendor: "Google",
    product: record.product,
    category: record.category ?? "productivity_suite",
    annual_cost: "",
    currency: "",
    purchased_seats: record.purchased_seats,
    assigned_seats: record.assigned_seats,
    active_users_30d: record.active_users_30d,
    active_users_90d: record.active_users_90d,
    last_activity_at: record.last_activity_at ?? "",
    department: "",
    owner: "",
    contract_reference: record.external_product_id
  }));
}

export function buildGoogleWorkspaceSyncIdempotencyKey(input: {
  organizationId: string;
  connectionId: string;
  collectedAt?: string | null;
}) {
  return hashStable({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    day: input.collectedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  });
}

export function sanitizeGoogleWorkspaceOperationalMetadata(metadata: Record<string, unknown>) {
  const safeKeys = new Set([
    "organizationId", "actorUserId", "connectionId", "syncRunId", "customerId", "domain",
    "status", "lastErrorCode", "rowCount", "retryCount", "durationMs", "provider",
    "warningCodes", "capabilityCategory", "taxonomyVersion", "feedbackClassification", "feedbackReason"
  ]);
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => safeKeys.has(key) && value !== undefined)
      .map(([key, value]) => [key, sanitizeSafeValue(value)])
  );
}

export function normalizeGoogleWorkspaceFailureCode(value: unknown) {
  const allowed = new Set([
    "unauthorized",
    "permission_error",
    "revoked_access",
    "expired_credential",
    "provider_timeout",
    "provider_retry_exhausted",
    "provider_request_failed",
    "provider_payload_too_large",
    "provider_page_limit_exceeded",
    "malformed_licensing_response",
    "malformed_reports_response",
    "malformed_provider_response",
    "transport_error",
    "timeout",
    "not_configured",
    "google_token_refresh_failed",
    "google_token_request_timeout",
    "google_token_request_failed",
    "google_workspace_sync_failed"
  ]);
  return typeof value === "string" && allowed.has(value) ? value : "provider_request_failed";
}

function getMissingGoogleWorkspaceConfig(config: GoogleWorkspaceOAuthConfig) {
  if (!config.clientId) return { ok: false as const, reason: "missing_client_id", safeMessage: "Google Workspace OAuth client ID is not configured." };
  if (!config.clientSecret) return { ok: false as const, reason: "missing_client_secret", safeMessage: "Google Workspace OAuth client secret is not configured." };
  if (!config.redirectUri) return { ok: false as const, reason: "missing_redirect_uri", safeMessage: "Google Workspace OAuth redirect URI is not configured." };
  if (!config.signingSecret) return { ok: false as const, reason: "missing_signing_secret", safeMessage: "Add-on signing secret is required for Google Workspace connection state." };
  if (!config.credentialEncryptionKey) return { ok: false as const, reason: "missing_encryption_key", safeMessage: "Google Workspace credential encryption is not configured." };
  return null;
}

function parseGrantedGoogleScopes(value: unknown) {
  return typeof value === "string" ? [...new Set(value.split(/\s+/).filter(Boolean))].sort() : [];
}

function assertRequiredGoogleScopes(grantedScopes: string[]) {
  if (GOOGLE_WORKSPACE_REQUIRED_SCOPES.some((scope) => !grantedScopes.includes(scope))) {
    throw new Error("permission_error");
  }
}

async function fetchGoogleToken(fetchImpl: typeof fetch, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    return await fetchImpl("https://oauth2.googleapis.com/token", { ...init, signal: controller.signal });
  } catch (error) {
    const timeoutError = error instanceof Error && (error.name === "AbortError" || controller.signal.aborted);
    throw new Error(timeoutError ? "google_token_request_timeout" : "google_token_request_failed");
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeSafeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeSafeValue).filter((item) => item !== undefined);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return undefined;
  if (/token|secret|authorization|bearer|refresh|access|payload|user email|raw/i.test(value)) return "[redacted]";
  return value.slice(0, 160);
}

function hashStable(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
