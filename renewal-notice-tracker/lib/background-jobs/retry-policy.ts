import { addMinutes } from "date-fns";

export type JobFailureCategory =
  | "validation_failed"
  | "permission_denied"
  | "entitlement_denied"
  | "tenant_scope_mismatch"
  | "trusted_gate_blocked"
  | "upstream_provider_failed"
  | "timeout"
  | "retry_scheduled"
  | "retry_exhausted"
  | "background_job_failed"
  | "cancelled"
  | "unknown";

export type ClassifiedJobFailure = {
  category: JobFailureCategory;
  retryable: boolean;
  code: string;
  safeMessage: string;
};

const SENSITIVE_VALUE_PATTERN =
  /raw\s+(?:contract|ocr|note|document)|contract text|ocr output|note text|provider payload|storage path|supabase\/storage|secret|token|bearer|authorization|saml|oidc|scim|payment/i;

export function sanitizeJobErrorMessage(value: unknown) {
  const message =
    value instanceof Error
      ? value.message
      : typeof value === "string"
        ? value
        : "Background job failed.";

  if (SENSITIVE_VALUE_PATTERN.test(message)) {
    return "Background job failed with redacted sensitive details.";
  }

  return message.length > 180 ? `${message.slice(0, 177)}...` : message;
}

export function classifyJobFailure(input: {
  error?: unknown;
  code?: string | null;
  statusCode?: number | null;
  retryable?: boolean;
  category?: JobFailureCategory | null;
}): ClassifiedJobFailure {
  if (input.category) {
    return {
      category: input.category,
      retryable:
        input.retryable ??
        (input.category === "timeout" || input.category === "upstream_provider_failed"),
      code: input.code ?? codeForCategory(input.category),
      safeMessage: sanitizeJobErrorMessage(input.error)
    };
  }

  if (input.statusCode === 408 || input.statusCode === 429 || Number(input.statusCode) >= 500) {
    return {
      category: input.statusCode === 408 ? "timeout" : "upstream_provider_failed",
      retryable: input.retryable ?? true,
      code: input.code ?? "ERR_BACKGROUND_JOB_TRANSIENT_001",
      safeMessage: sanitizeJobErrorMessage(input.error)
    };
  }

  if (Number(input.statusCode) >= 400) {
    return {
      category: "validation_failed",
      retryable: input.retryable ?? false,
      code: input.code ?? "ERR_BACKGROUND_JOB_PERMANENT_001",
      safeMessage: sanitizeJobErrorMessage(input.error)
    };
  }

  return {
    category: "unknown",
    retryable: input.retryable ?? false,
    code: input.code ?? "ERR_BACKGROUND_JOB_UNKNOWN_001",
    safeMessage: sanitizeJobErrorMessage(input.error)
  };
}

export function computeNextRetryAt(input: {
  attemptNumber: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const minutes = Math.min(60, Math.max(1, 2 ** Math.max(0, input.attemptNumber - 1)));
  return addMinutes(now, minutes).toISOString();
}

function codeForCategory(category: JobFailureCategory) {
  switch (category) {
    case "trusted_gate_blocked":
      return "ERR_TRUSTED_REMINDER_GATE_BLOCKED_001";
    case "timeout":
      return "ERR_BACKGROUND_JOB_TIMEOUT_001";
    case "upstream_provider_failed":
      return "ERR_BACKGROUND_JOB_PROVIDER_001";
    case "retry_exhausted":
      return "ERR_BACKGROUND_JOB_RETRY_EXHAUSTED_001";
    case "cancelled":
      return "ERR_BACKGROUND_JOB_CANCELLED_001";
    default:
      return "ERR_BACKGROUND_JOB_FAILED_001";
  }
}
