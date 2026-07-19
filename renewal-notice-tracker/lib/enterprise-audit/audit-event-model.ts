import type { Json } from "@/lib/supabase/database.types";

export type EnterpriseAuditEventCategory =
  | "auth"
  | "contract"
  | "evidence"
  | "trusted_reminder"
  | "trust_exception"
  | "renewal_decision"
  | "import"
  | "export"
  | "billing"
  | "admin"
  | "integration"
  | "system";

export type EnterpriseAuditSeverity = "info" | "warning" | "critical";

export type EnterpriseAuditEventSource =
  | "audit_logs"
  | "contract_audit_events"
  | "trusted_reminder_gate_events"
  | "trust_exception_approval_events"
  | "renewal_decision_events"
  | "organization_activation_events";

export type EnterpriseAuditEvent = {
  id: string;
  organizationId: string;
  contractId: string | null;
  actorUserId: string | null;
  actorLabel: string;
  eventType: string;
  eventCategory: EnterpriseAuditEventCategory;
  eventSource: EnterpriseAuditEventSource;
  severity: EnterpriseAuditSeverity;
  summary: string;
  metadata: Record<string, Json>;
  createdAt: string;
  isSecuritySensitive: boolean;
  isTrustSensitive: boolean;
  isExportable: boolean;
};

export type EnterpriseAuditSourceRow = {
  id: string;
  organization_id: string;
  contract_id?: string | null;
  actor_user_id?: string | null;
  action?: string | null;
  event_type?: string | null;
  event_source?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: unknown;
  metadata?: unknown;
  created_at: string;
};

const FORBIDDEN_METADATA_KEYS = [
  "assertion",
  "auth_code",
  "backup_contents",
  "body",
  "certificate",
  "clause_text",
  "content",
  "debug_trace",
  "document_contents",
  "email_body",
  "error_stack",
  "extracted_text",
  "file_contents",
  "full_note",
  "html",
  "id_token",
  "note",
  "notes",
  "ocr_output",
  "password",
  "payment_secret",
  "private_key",
  "provider_payload",
  "raw",
  "raw_contract_text",
  "raw_ocr",
  "raw_provider_payload",
  "request_body",
  "response_body",
  "saml_response",
  "scim_payload",
  "secret",
  "snippet",
  "stack",
  "storage_path",
  "text",
  "token",
  "uploaded_document"
];

const SENSITIVE_VALUE_PATTERNS = [
  /raw contract/i,
  /ocr output/i,
  /provider payload/i,
  /saml assertion/i,
  /oidc token/i,
  /scim bearer/i,
  /storage path/i,
  /uploaded document/i,
  /payment secret/i,
  /full note/i,
  /private key/i,
  /debug trace/i
];

const REDACTED = "[redacted]";
const MAX_SAFE_STRING_LENGTH = 180;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeKey(key: string) {
  return key.trim().toLowerCase();
}

function isForbiddenKey(key: string) {
  const normalized = normalizeKey(key);
  return FORBIDDEN_METADATA_KEYS.some(
    (forbidden) => normalized === forbidden || normalized.includes(forbidden)
  );
}

function sanitizeString(value: string) {
  if (SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return REDACTED;
  }
  const normalized = value.trim();
  if (normalized.length <= MAX_SAFE_STRING_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SAFE_STRING_LENGTH)}...`;
}

function sanitizeMetadataValue(value: unknown): Json | undefined {
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetadataValue(item))
      .filter((item): item is Json => item !== undefined);
  }
  if (isPlainRecord(value)) {
    return redactEnterpriseAuditMetadata(value);
  }
  return undefined;
}

export function redactEnterpriseAuditMetadata(input: unknown): Record<string, Json> {
  if (!isPlainRecord(input)) return {};

  return Object.fromEntries(
    Object.entries(input).flatMap(([key, value]) => {
      if (isForbiddenKey(key)) return [];
      const sanitized = sanitizeMetadataValue(value);
      if (sanitized === undefined) return [];
      return [[key, sanitized]];
    })
  );
}

export function sanitizeEnterpriseAuditSummary(summary: string) {
  const sanitized = sanitizeString(summary);
  if (sanitized === REDACTED) {
    return "Sensitive event recorded";
  }
  return sanitized || "Audit event recorded";
}

function sentenceCase(value: string) {
  const normalized = value.replaceAll("_", " ").replaceAll(".", ": ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function classifyEnterpriseAuditCategory(
  eventType: string,
  source: EnterpriseAuditEventSource,
  metadata: Record<string, Json> = {}
): EnterpriseAuditEventCategory {
  const value = `${source}.${eventType}`.toLowerCase();
  const entityType = typeof metadata.entity_type === "string" ? metadata.entity_type.toLowerCase() : "";

  if (value.includes("auth") || value.includes("permission") || value.includes("denied")) return "auth";
  if (value.includes("trust_exception") || value.includes("exception_approval")) return "trust_exception";
  if (value.includes("trusted_reminder") || value.includes("reminder_gate")) return "trusted_reminder";
  if (value.includes("renewal_decision") || value.includes("decision")) return "renewal_decision";
  if (value.includes("evidence") || value.includes("review")) return "evidence";
  if (value.includes("import") || entityType.includes("import")) return "import";
  if (value.includes("export") || entityType.includes("export")) return "export";
  if (value.includes("billing") || value.includes("subscription")) return "billing";
  if (value.includes("admin") || value.includes("internal") || value.includes("delete")) return "admin";
  if (value.includes("integration") || value.includes("webhook")) return "integration";
  if (source === "contract_audit_events" || entityType.includes("contract")) return "contract";
  return "system";
}

export function classifyEnterpriseAuditSeverity(
  eventType: string,
  metadata: Record<string, Json> = {}
): EnterpriseAuditSeverity {
  const value = eventType.toLowerCase();
  const status = typeof metadata.status === "string" ? metadata.status.toLowerCase() : "";
  const reason = typeof metadata.reason === "string" ? metadata.reason.toLowerCase() : "";

  if (
    value.includes("failed") ||
    value.includes("denied") ||
    value.includes("revoked") ||
    value.includes("deleted") ||
    status === "failed" ||
    reason.includes("permission") ||
    reason.includes("cross_org")
  ) {
    return "critical";
  }

  if (
    value.includes("blocked") ||
    value.includes("warning") ||
    value.includes("weak") ||
    value.includes("requested") ||
    status === "blocked"
  ) {
    return "warning";
  }

  return "info";
}

export function isEnterpriseTrustSensitiveEvent(
  eventType: string,
  source: EnterpriseAuditEventSource,
  metadata: Record<string, Json> = {}
) {
  const value = `${source}.${eventType}`.toLowerCase();
  const approvalUsed = metadata.approval_id || metadata.approvalId || metadata.approval_state;

  return (
    value.includes("trust_exception") ||
    value.includes("exception_approval") ||
    value.includes("evidence_review") ||
    value.includes("trusted_reminder") ||
    value.includes("reminder_gate") ||
    Boolean(value.includes("gate") && approvalUsed)
  );
}

export function isEnterpriseSecuritySensitiveEvent(
  eventType: string,
  category: EnterpriseAuditEventCategory,
  metadata: Record<string, Json> = {}
) {
  const value = eventType.toLowerCase();
  const reason = typeof metadata.reason === "string" ? metadata.reason.toLowerCase() : "";

  return (
    category === "auth" ||
    category === "admin" ||
    category === "export" ||
    value.includes("delete") ||
    value.includes("denied") ||
    value.includes("permission") ||
    value.includes("internal_route") ||
    reason.includes("permission") ||
    reason.includes("forbidden")
  );
}

export function normalizeEnterpriseAuditEvent(
  row: EnterpriseAuditSourceRow,
  source: EnterpriseAuditEventSource,
  options?: { actorLabels?: Record<string, string> }
): EnterpriseAuditEvent {
  const eventType = row.event_type ?? row.action ?? "audit.event_recorded";
  const rawMetadata = row.metadata ?? row.details ?? {};
  const metadata = redactEnterpriseAuditMetadata({
    ...(isPlainRecord(rawMetadata) ? rawMetadata : {}),
    ...(row.entity_type ? { entity_type: row.entity_type } : {}),
    ...(row.entity_id ? { entity_id: row.entity_id } : {}),
    ...(row.event_source ? { event_source: row.event_source } : {})
  });
  const eventCategory = classifyEnterpriseAuditCategory(eventType, source, metadata);
  const severity = classifyEnterpriseAuditSeverity(eventType, metadata);
  const isTrustSensitive = isEnterpriseTrustSensitiveEvent(eventType, source, metadata);
  const isSecuritySensitive = isEnterpriseSecuritySensitiveEvent(eventType, eventCategory, metadata);
  const actorUserId = row.actor_user_id ?? null;
  const summary =
    typeof metadata.summary === "string"
      ? metadata.summary
      : sentenceCase(eventType);

  return {
    id: `${source}:${row.id}`,
    organizationId: row.organization_id,
    contractId: row.contract_id ?? null,
    actorUserId,
    actorLabel: actorUserId ? options?.actorLabels?.[actorUserId] ?? actorUserId : "System",
    eventType,
    eventCategory,
    eventSource: source,
    severity,
    summary: sanitizeEnterpriseAuditSummary(summary),
    metadata,
    createdAt: row.created_at,
    isSecuritySensitive,
    isTrustSensitive,
    isExportable: true
  };
}
