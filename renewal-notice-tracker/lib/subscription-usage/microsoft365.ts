import crypto from "node:crypto";
import type { MembershipRole } from "@/lib/auth";
import type { UsageInventoryConnectorResult } from "@/lib/add-ons/java-enterprise-client";
import type { SubscriptionUsageImportRow } from "@/lib/subscription-usage/types";

export const MICROSOFT_365_USAGE_PROVIDER = "microsoft_365" as const;
export const MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS = [
  "LicenseAssignment.Read.All",
  "Reports.Read.All"
] as const;
const MICROSOFT_STATE_MAX_AGE_MS = 15 * 60 * 1000;
const MICROSOFT_TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;

type CachedMicrosoftToken = {
  accessToken: string;
  expiresAtMs: number;
  permissions: string[];
};

const microsoftTokenCache = new Map<string, CachedMicrosoftToken>();

export type Microsoft365ConnectionStatus =
  | "pending_admin_consent"
  | "connected"
  | "permission_error"
  | "expired_credential"
  | "tenant_mismatch"
  | "verification_failed"
  | "provider_unavailable"
  | "revoked_access"
  | "disconnected";

export type Microsoft365SyncStatus = "queued" | "processing" | "completed" | "partial" | "failed" | "cancelled";

export type Microsoft365AdminConsentState = {
  organizationId: string;
  actorUserId: string;
  nonce: string;
  issuedAt: string;
};

export type Microsoft365AdminConsentConfig = {
  clientId: string | null;
  clientSecret?: string | null;
  redirectUri: string | null;
  signingSecret: string | null;
};

export type Microsoft365ApplicationCredentialConfig = {
  clientId: string | null;
  clientSecret: string | null;
};

export type Microsoft365ConnectionInput = {
  organizationId: string;
  actorUserId: string;
  tenantId: string;
  tenantName?: string | null;
};

export type Microsoft365ConnectionRecord = Microsoft365ConnectionInput & {
  provider: typeof MICROSOFT_365_USAGE_PROVIDER;
  status: Microsoft365ConnectionStatus;
  credentialReference: string;
  credentialFingerprint: string;
  requiredPermissions: string[];
};

export function canManageSubscriptionUsageConnection(role: MembershipRole) {
  return ["owner", "admin", "operator"].includes(role);
}

export function buildMicrosoft365AdminConsentUrl(input: {
  config: Microsoft365AdminConsentConfig;
  state: Microsoft365AdminConsentState;
}) {
  if (!input.config.clientId) {
    return { ok: false as const, reason: "missing_client_id", safeMessage: "Microsoft 365 app client ID is not configured." };
  }
  if (!input.config.redirectUri) {
    return { ok: false as const, reason: "missing_redirect_uri", safeMessage: "Microsoft 365 admin consent redirect URI is not configured." };
  }
  if (!input.config.signingSecret) {
    return { ok: false as const, reason: "missing_signing_secret", safeMessage: "Add-on signing secret is required for Microsoft 365 connection state." };
  }

  const url = new URL("https://login.microsoftonline.com/common/adminconsent");
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("redirect_uri", input.config.redirectUri);
  url.searchParams.set("state", signMicrosoft365AdminConsentState(input.state, input.config.signingSecret));
  return { ok: true as const, url: url.toString() };
}

export function signMicrosoft365AdminConsentState(state: Microsoft365AdminConsentState, secret: string) {
  const body = Buffer.from(JSON.stringify(state)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyMicrosoft365AdminConsentState(value: string, secret: string, now = new Date()) {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Microsoft365AdminConsentState;
    if (
      typeof parsed.organizationId !== "string" || !parsed.organizationId || parsed.organizationId.length > 128
      || typeof parsed.actorUserId !== "string" || !parsed.actorUserId || parsed.actorUserId.length > 128
      || typeof parsed.nonce !== "string" || !/^[a-zA-Z0-9-]{16,128}$/.test(parsed.nonce)
      || typeof parsed.issuedAt !== "string"
    ) return null;
    const issuedAtMs = Date.parse(parsed.issuedAt);
    if (!Number.isFinite(issuedAtMs) || issuedAtMs > now.getTime() + 60_000) return null;
    if (now.getTime() - issuedAtMs > MICROSOFT_STATE_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashMicrosoft365ConsentNonce(nonce: string) {
  return crypto.createHash("sha256").update(`microsoft365-consent:${nonce}`).digest("hex");
}

export async function acquireMicrosoft365ApplicationToken(input: {
  tenantId: string;
  config: Microsoft365ApplicationCredentialConfig;
  fetchImpl?: typeof fetch;
  now?: Date;
}) {
  const tenantId = normalizeTenantId(input.tenantId);
  if (!input.config.clientId || !input.config.clientSecret) {
    throw new Error("expired_credential");
  }
  const nowMs = (input.now ?? new Date()).getTime();
  const credentialFingerprint = crypto.createHash("sha256").update(input.config.clientSecret).digest("hex").slice(0, 16);
  const cacheKey = `${tenantId}:${input.config.clientId}:${credentialFingerprint}`;
  const cached = microsoftTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs - MICROSOFT_TOKEN_REFRESH_SKEW_MS > nowMs) {
    return { ...cached, fromCache: true as const };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials"
      }),
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    throw new Error("provider_unavailable");
  }
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new Error(response.status === 400 || response.status === 401 ? "expired_credential" : "provider_unavailable");
  }
  const claims = decodeMicrosoftJwtClaims(payload.access_token);
  if (claims.tenantId !== tenantId) throw new Error("tenant_mismatch");
  if (!["https://graph.microsoft.com", "00000003-0000-0000-c000-000000000000"].includes(claims.audience)) {
    throw new Error("verification_failed");
  }
  if (claims.applicationId !== input.config.clientId) throw new Error("verification_failed");
  if (!isMicrosoftIssuerForTenant(claims.issuer, tenantId)) throw new Error("verification_failed");
  const nowSeconds = Math.floor(nowMs / 1000);
  if (!Number.isFinite(claims.expiresAt) || claims.expiresAt <= nowSeconds) throw new Error("expired_credential");
  if (!Number.isFinite(claims.notBefore) || claims.notBefore > nowSeconds + 60) throw new Error("verification_failed");
  const missing = MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS.filter((permission) => !claims.permissions.includes(permission));
  if (missing.length > 0) throw new Error("permission_error");
  const expiresInSeconds = typeof payload.expires_in === "number" ? payload.expires_in : Number(payload.expires_in ?? 3600);
  const token: CachedMicrosoftToken = {
    accessToken: payload.access_token,
    expiresAtMs: Math.min(
      claims.expiresAt * 1000,
      nowMs + Math.max(1, Number.isFinite(expiresInSeconds) ? expiresInSeconds : 3600) * 1000
    ),
    permissions: claims.permissions
  };
  microsoftTokenCache.set(cacheKey, token);
  return { ...token, fromCache: false as const };
}

export async function verifyMicrosoft365Connection(input: {
  tenantId: string;
  accessToken: string;
  permissions: string[];
  fetchImpl?: typeof fetch;
}) {
  const tenantId = normalizeTenantId(input.tenantId);
  const missing = MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS.filter((permission) => !input.permissions.includes(permission));
  if (missing.length > 0) throw new Error("permission_error");
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)("https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuId&$top=1", {
      headers: { authorization: `Bearer ${input.accessToken}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000)
    });
  } catch {
    throw new Error("provider_unavailable");
  }
  if (response.status === 401) throw new Error("expired_credential");
  if (response.status === 403) throw new Error("permission_error");
  if (!response.ok) throw new Error("verification_failed");
  return { tenantId, verifiedPermissions: [...input.permissions] };
}

export function clearMicrosoft365TokenCacheForTests() {
  microsoftTokenCache.clear();
}

export function buildMicrosoft365ConnectionRecord(input: Microsoft365ConnectionInput): Microsoft365ConnectionRecord {
  const tenantId = normalizeTenantId(input.tenantId);
  const credentialReference = `managed-secret:microsoft365:${input.organizationId}:${tenantId}`;
  return {
    provider: MICROSOFT_365_USAGE_PROVIDER,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    tenantId,
    tenantName: normalizeSafeLabel(input.tenantName) ?? "Microsoft 365 tenant",
    status: "connected",
    credentialReference,
    credentialFingerprint: hashStable(`m365:${input.organizationId}:${tenantId}`).slice(0, 16),
    requiredPermissions: [...MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS]
  };
}

export function buildMicrosoft365SyncIdempotencyKey(input: {
  organizationId: string;
  connectionId: string;
  snapshotExternalId?: string | null;
  collectedAt?: string | null;
}) {
  return hashStable({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    snapshotExternalId: input.snapshotExternalId ?? "manual-sync",
    collectedAt: input.collectedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  });
}

export function mapMicrosoft365SnapshotToImportRows(
  result: UsageInventoryConnectorResult
): SubscriptionUsageImportRow[] {
  return result.records.map((record) => ({
    vendor: "Microsoft",
    product: record.product,
    category: record.category ?? "productivity",
    annual_cost: "",
    currency: "",
    purchased_seats: record.purchased_seats,
    assigned_seats: record.assigned_seats,
    active_users_30d: record.active_users_30d,
    active_users_90d: record.active_users_90d,
    last_activity_at: record.last_activity_at ?? "",
    department: "",
    owner: "",
    contract_reference: record.external_product_id,
    warning_codes: record.warning_codes ?? [],
    evidence_state: evidenceStateForWarnings(record.warning_codes ?? [])
  }));
}

function evidenceStateForWarnings(warnings: string[]) {
  if (warnings.some((code) => /missing|unavailable/.test(code))) return "missing" as const;
  if (warnings.some((code) => /stale/.test(code))) return "stale" as const;
  if (warnings.some((code) => /unmapped/.test(code))) return "unmapped" as const;
  return warnings.length > 0 ? "partial" as const : "complete" as const;
}

export function sanitizeMicrosoft365OperationalMetadata(metadata: Record<string, unknown>) {
  const safeKeys = new Set([
    "organizationId",
    "actorUserId",
    "connectionId",
    "syncRunId",
    "tenantId",
    "tenantName",
    "status",
    "lastErrorCode",
    "rowCount",
    "retryCount",
    "durationMs",
    "idempotencyKey",
    "provider",
    "warningCodes"
  ]);

  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => safeKeys.has(key) && value !== undefined)
      .map(([key, value]) => [key, sanitizeScalar(value)])
  );
}

function sanitizeScalar(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeScalar).filter((item) => item !== undefined);
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return undefined;
  if (/token|secret|authorization|bearer|refresh|access|payload|graph response|user principal|email/i.test(value)) {
    return "[redacted]";
  }
  return value.slice(0, 160);
}

function normalizeTenantId(value: string) {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(trimmed)) {
    throw new Error("Microsoft tenant identifier is invalid.");
  }
  return trimmed;
}

function decodeMicrosoftJwtClaims(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) throw new Error("invalid");
    const encodedPayload = parts[1];
    if (!encodedPayload) throw new Error("invalid");
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Record<string, unknown>;
    const permissions = Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === "string")
      : [];
    return {
      tenantId: String(payload.tid ?? ""),
      audience: String(payload.aud ?? ""),
      applicationId: String(payload.appid ?? payload.azp ?? ""),
      issuer: String(payload.iss ?? ""),
      expiresAt: Number(payload.exp),
      notBefore: Number(payload.nbf),
      permissions
    };
  } catch {
    throw new Error("verification_failed");
  }
}

function isMicrosoftIssuerForTenant(issuer: string, tenantId: string) {
  return issuer === `https://sts.windows.net/${tenantId}/`
    || issuer === `https://login.microsoftonline.com/${tenantId}/v2.0`;
}

function normalizeSafeLabel(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/token|secret|authorization|payload/i.test(text)) return null;
  return text.slice(0, 120);
}

function hashStable(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
