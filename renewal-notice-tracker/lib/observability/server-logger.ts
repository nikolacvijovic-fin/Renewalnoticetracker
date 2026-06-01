const SENSITIVE_KEY_PATTERN =
  /secret|token|password|authorization|cookie|api[_-]?key|raw|payload|document|extracted|evidence|note|body|clause/i;

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

function sanitizeLogValue(value: unknown): unknown {
  if (value == null) return value;

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 237)}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeLogValue);
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message
    };
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitizeLogValue(entry)
      ])
    );
  }

  return String(value);
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
    metadata: sanitizeLogValue(input.metadata ?? {}),
    error: input.error ? sanitizeLogValue(input.error) : null,
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
