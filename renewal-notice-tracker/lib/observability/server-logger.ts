const SENSITIVE_KEY_PATTERN =
  /secret|token|password|authorization|cookie|api[_-]?key|raw|payload|document|extracted|evidence|note|body|clause|assertion|saml|oidc|scim|certificate|private[_-]?key|payment/i;
const SENSITIVE_VALUE_PATTERN =
  /confidential|should never be logged|raw\s+(?:contract|ocr|note|document)|ocr output|contract text|note text|renewal clause|provider payload|storage path|supabase\/storage|bearer\s+[a-z0-9._-]+|saml\s+assertion|oidc\s+(?:id|access|refresh)?\s*token|scim\s+bearer|payment\s+secret|provider\s+response|private\s+key|certificate|sk_[a-z0-9]/i;

export type ServerLogLevel = "info" | "warn" | "error";

export type ServerLogInput = {
  event: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  route?: string | null;
  action?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
  error?: unknown;
};

export function sanitizeOperationalValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    if (SENSITIVE_VALUE_PATTERN.test(value)) return "[REDACTED]";
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeOperationalValue);
  }

  if (value instanceof Error) {
    return sanitizeOperationalError(value);
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeOperationalValue(entry)
      ])
    );
  }

  return String(value);
}

export function sanitizeOperationalError(error: unknown): unknown {
  if (!error) return null;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: "[REDACTED]"
    };
  }

  return sanitizeOperationalValue(error);
}

export function buildServerLogEntry(level: ServerLogLevel, input: ServerLogInput) {
  return {
    level,
    event: input.event,
    organization_id: input.organizationId ?? null,
    actor_user_id: input.actorUserId ?? null,
    route: input.route ?? null,
    action: input.action ?? null,
    request_id: input.requestId ?? null,
    metadata: sanitizeOperationalValue(input.metadata ?? {}),
    error: input.error ? sanitizeOperationalError(input.error) : null,
    logged_at: new Date().toISOString()
  };
}

export function logServerInfo(input: ServerLogInput) {
  console.info(JSON.stringify(buildServerLogEntry("info", input)));
}

export function logServerWarn(input: ServerLogInput) {
  console.warn(JSON.stringify(buildServerLogEntry("warn", input)));
}

export function logServerError(input: ServerLogInput) {
  console.error(JSON.stringify(buildServerLogEntry("error", input)));
}
