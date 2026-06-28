import {
  logServerError,
  logServerInfo,
  logServerWarn,
  sanitizeOperationalError,
  sanitizeOperationalValue,
  type ServerLogLevel
} from "@/lib/observability/server-logger";

export const OPERATIONAL_FAILURE_CATEGORIES = [
  "validation_failed",
  "permission_denied",
  "entitlement_denied",
  "tenant_scope_mismatch",
  "upstream_provider_failed",
  "timeout",
  "retry_scheduled",
  "retry_exhausted",
  "background_job_failed",
  "partial_success",
  "cancelled",
  "unknown"
] as const;

export type OperationalFailureCategory = (typeof OPERATIONAL_FAILURE_CATEGORIES)[number];

export const OPERATIONAL_SUBSYSTEMS = [
  "exports",
  "reminders",
  "ocr",
  "billing",
  "enterprise_identity",
  "contract_review",
  "intelligence",
  "internal_operations"
] as const;

export type OperationalSubsystem = (typeof OPERATIONAL_SUBSYSTEMS)[number];
export type OperationalLogLevel = ServerLogLevel;
export type OperationalLogStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "denied"
  | "queued"
  | "processing"
  | "retrying"
  | "cancelled";

export type OperationalLogInput = {
  level: OperationalLogLevel;
  operation: string;
  subsystem: OperationalSubsystem;
  organizationId?: string | null;
  actorId?: string | null;
  contractId?: string | null;
  jobId?: string | null;
  requestId?: string | null;
  status: OperationalLogStatus;
  durationMs?: number | null;
  retryCount?: number | null;
  errorCategory?: OperationalFailureCategory | null;
  safeMetadata?: Record<string, unknown>;
  error?: unknown;
};

export type OperationalLogEnvelope = {
  timestamp: string;
  level: OperationalLogLevel;
  operation: string;
  subsystem: OperationalSubsystem;
  organizationId: string | null;
  actorId: string | null;
  contractId: string | null;
  jobId: string | null;
  requestId: string | null;
  status: OperationalLogStatus;
  durationMs: number | null;
  retryCount: number | null;
  errorCategory: OperationalFailureCategory | null;
  safeMetadata: Record<string, unknown>;
  error: unknown;
  signalType: "operational_log";
};

export type SupportDiagnosticInput = {
  subsystem: OperationalSubsystem;
  operation: string;
  organizationId?: string | null;
  actorId?: string | null;
  contractId?: string | null;
  jobId?: string | null;
  requestId?: string | null;
  status: OperationalLogStatus;
  failureCategory?: OperationalFailureCategory | null;
  failureCode?: string | null;
  retryCount?: number | null;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  safeMetadata?: Record<string, unknown>;
};

export type SupportDiagnosticSummary = {
  subsystem: OperationalSubsystem;
  operation: string;
  organizationId: string | null;
  actorId: string | null;
  contractId: string | null;
  jobId: string | null;
  requestId: string | null;
  status: OperationalLogStatus;
  failureCategory: OperationalFailureCategory | null;
  failureCode: string | null;
  retryCount: number | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  safeMetadata: Record<string, unknown>;
  signalType: "support_diagnostic";
};

export function isOperationalFailureCategory(
  category: string | null | undefined
): category is OperationalFailureCategory {
  return OPERATIONAL_FAILURE_CATEGORIES.includes(category as OperationalFailureCategory);
}

function normalizeFailureCategory(
  category: OperationalFailureCategory | null | undefined
): OperationalFailureCategory | null {
  if (!category) return null;
  return isOperationalFailureCategory(category) ? category : "unknown";
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  return sanitizeOperationalValue(metadata ?? {}) as Record<string, unknown>;
}

export function buildOperationalLogEnvelope(input: OperationalLogInput): OperationalLogEnvelope {
  return {
    timestamp: new Date().toISOString(),
    level: input.level,
    operation: input.operation,
    subsystem: input.subsystem,
    organizationId: input.organizationId ?? null,
    actorId: input.actorId ?? null,
    contractId: input.contractId ?? null,
    jobId: input.jobId ?? null,
    requestId: input.requestId ?? null,
    status: input.status,
    durationMs: input.durationMs ?? null,
    retryCount: input.retryCount ?? null,
    errorCategory: normalizeFailureCategory(input.errorCategory),
    safeMetadata: sanitizeMetadata(input.safeMetadata),
    error: input.error ? sanitizeOperationalError(input.error) : null,
    signalType: "operational_log"
  };
}

export function writeOperationalLog(input: OperationalLogInput) {
  const envelope = buildOperationalLogEnvelope(input);
  const logInput = {
    event: `ops.${envelope.subsystem}.${envelope.operation}`,
    organizationId: envelope.organizationId,
    actorUserId: envelope.actorId,
    action: envelope.operation,
    requestId: envelope.requestId,
    metadata: envelope,
    error: envelope.error
  };

  if (envelope.level === "error") {
    logServerError(logInput);
    return envelope;
  }

  if (envelope.level === "warn") {
    logServerWarn(logInput);
    return envelope;
  }

  logServerInfo(logInput);
  return envelope;
}

export function buildSupportDiagnosticSummary(
  input: SupportDiagnosticInput
): SupportDiagnosticSummary {
  return {
    subsystem: input.subsystem,
    operation: input.operation,
    organizationId: input.organizationId ?? null,
    actorId: input.actorId ?? null,
    contractId: input.contractId ?? null,
    jobId: input.jobId ?? null,
    requestId: input.requestId ?? null,
    status: input.status,
    failureCategory: normalizeFailureCategory(input.failureCategory),
    failureCode: input.failureCode ?? null,
    retryCount: input.retryCount ?? null,
    lastAttemptAt: input.lastAttemptAt ?? null,
    nextRetryAt: input.nextRetryAt ?? null,
    safeMetadata: sanitizeMetadata(input.safeMetadata),
    signalType: "support_diagnostic"
  };
}

export function buildFailedExportDiagnostic(input: Omit<SupportDiagnosticInput, "subsystem" | "operation">) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "exports",
    operation: "export_failed"
  });
}

export function buildFailedReminderDiagnostic(input: Omit<SupportDiagnosticInput, "subsystem" | "operation">) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "reminders",
    operation: "reminder_failed"
  });
}

export function buildFailedOcrDiagnostic(input: Omit<SupportDiagnosticInput, "subsystem" | "operation">) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "ocr",
    operation: "ocr_job_failed"
  });
}

export function buildFailedScimProvisioningDiagnostic(
  input: Omit<SupportDiagnosticInput, "subsystem" | "operation">
) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "enterprise_identity",
    operation: "scim_provisioning_failed"
  });
}

export function buildFailedSsoDiagnostic(input: Omit<SupportDiagnosticInput, "subsystem" | "operation">) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "enterprise_identity",
    operation: "sso_callback_failed"
  });
}

export function buildBillingEntitlementMismatchDiagnostic(
  input: Omit<SupportDiagnosticInput, "subsystem" | "operation">
) {
  return buildSupportDiagnosticSummary({
    ...input,
    subsystem: "billing",
    operation: "billing_entitlement_mismatch"
  });
}
