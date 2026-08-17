import crypto from "node:crypto";
import type { MembershipRole } from "@/lib/auth";
import type { UsageInventoryConnectorResult } from "@/lib/add-ons/java-enterprise-client";
import type { SubscriptionUsageImportRow } from "@/lib/subscription-usage/types";

export const MICROSOFT_365_USAGE_PROVIDER = "microsoft_365" as const;
export const MICROSOFT_365_REQUIRED_GRAPH_PERMISSIONS = [
  "LicenseAssignment.Read.All",
  "Reports.Read.All"
] as const;

export type Microsoft365ConnectionStatus =
  | "pending_admin_consent"
  | "connected"
  | "permission_error"
  | "expired_credential"
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
  redirectUri: string | null;
  signingSecret: string | null;
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

export function verifyMicrosoft365AdminConsentState(value: string, secret: string) {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Microsoft365AdminConsentState;
    if (!parsed.organizationId || !parsed.actorUserId || !parsed.nonce || !parsed.issuedAt) return null;
    return parsed;
  } catch {
    return null;
  }
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
    contract_reference: record.external_product_id
  }));
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

function normalizeSafeLabel(value: string | null | undefined) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  if (/token|secret|authorization|payload/i.test(text)) return null;
  return text.slice(0, 120);
}

function hashStable(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
