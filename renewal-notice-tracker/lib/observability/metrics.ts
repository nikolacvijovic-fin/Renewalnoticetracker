import type { OperationalSubsystem } from "@/lib/observability/operational-logging";

export type MetricType = "counter" | "gauge" | "histogram";
export type MetricSensitivity = "internal" | "customer_sensitive" | "restricted";

export const SAFE_METRIC_DIMENSIONS = [
  "subsystem",
  "operation",
  "status",
  "errorCategory",
  "planTier",
  "jobType",
  "providerType"
] as const;

export type SafeMetricDimension = (typeof SAFE_METRIC_DIMENSIONS)[number];

export const FORBIDDEN_METRIC_DIMENSIONS = [
  "rawUserEmail",
  "userEmail",
  "contractTitle",
  "contractText",
  "ocrText",
  "noteBody",
  "samlAssertion",
  "oidcToken",
  "scimBearerToken",
  "scimRawPayload",
  "billingProviderPayload",
  "storageObjectPath",
  "rawUserId",
  "rawContractId",
  "rawProviderResponse",
  "password",
  "secret",
  "token"
] as const;

export type ForbiddenMetricDimension = (typeof FORBIDDEN_METRIC_DIMENSIONS)[number];

export type MetricContract = {
  name: string;
  subsystem: OperationalSubsystem;
  type: MetricType;
  description: string;
  allowedDimensions: readonly SafeMetricDimension[];
  forbiddenDimensions: readonly ForbiddenMetricDimension[];
  sensitivity: MetricSensitivity;
  ownerRunbookArea: string;
};

function metric(input: Omit<MetricContract, "forbiddenDimensions">): MetricContract {
  return {
    ...input,
    forbiddenDimensions: FORBIDDEN_METRIC_DIMENSIONS
  };
}

export const METRIC_CONTRACTS = {
  "reminder.job.success_total": metric({
    name: "reminder.job.success_total",
    subsystem: "reminders",
    type: "counter",
    description: "Count of successfully processed reminder jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "reminders"
  }),
  "reminder.job.failure_total": metric({
    name: "reminder.job.failure_total",
    subsystem: "reminders",
    type: "counter",
    description: "Count of reminder dispatch or processing failures.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "reminders"
  }),
  "reminder.job.duration_ms": metric({
    name: "reminder.job.duration_ms",
    subsystem: "reminders",
    type: "histogram",
    description: "Reminder processing duration in milliseconds.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "reminders"
  }),
  "export.job.success_total": metric({
    name: "export.job.success_total",
    subsystem: "exports",
    type: "counter",
    description: "Count of successful sync/background export jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "exports"
  }),
  "export.job.failure_total": metric({
    name: "export.job.failure_total",
    subsystem: "exports",
    type: "counter",
    description: "Count of failed sync/background export jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "exports"
  }),
  "export.job.duration_ms": metric({
    name: "export.job.duration_ms",
    subsystem: "exports",
    type: "histogram",
    description: "Export artifact generation duration in milliseconds.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "exports"
  }),
  "export.job.chunk_count": metric({
    name: "export.job.chunk_count",
    subsystem: "exports",
    type: "histogram",
    description: "Number of chunks/pages assembled for an export artifact.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "exports"
  }),
  "export.job.row_count": metric({
    name: "export.job.row_count",
    subsystem: "exports",
    type: "histogram",
    description: "Number of rows included in a generated export.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "exports"
  }),
  "ocr.job.success_total": metric({
    name: "ocr.job.success_total",
    subsystem: "ocr",
    type: "counter",
    description: "Count of successful OCR jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "providerType", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "ocr"
  }),
  "ocr.job.failure_total": metric({
    name: "ocr.job.failure_total",
    subsystem: "ocr",
    type: "counter",
    description: "Count of failed OCR jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "providerType", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "ocr"
  }),
  "ocr.job.duration_ms": metric({
    name: "ocr.job.duration_ms",
    subsystem: "ocr",
    type: "histogram",
    description: "OCR processing duration in milliseconds.",
    allowedDimensions: ["subsystem", "operation", "status", "providerType", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "ocr"
  }),
  "ocr.backlog.oldest_age_minutes": metric({
    name: "ocr.backlog.oldest_age_minutes",
    subsystem: "ocr",
    type: "gauge",
    description: "Age in minutes of the oldest queued or processing OCR job.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "ocr"
  }),
  "contract_review.job.success_total": metric({
    name: "contract_review.job.success_total",
    subsystem: "contract_review",
    type: "counter",
    description: "Count of successful contract review workflow jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "contract_review"
  }),
  "contract_review.job.failure_total": metric({
    name: "contract_review.job.failure_total",
    subsystem: "contract_review",
    type: "counter",
    description: "Count of failed contract review workflow jobs.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "contract_review"
  }),
  "contract_review.job.duration_ms": metric({
    name: "contract_review.job.duration_ms",
    subsystem: "contract_review",
    type: "histogram",
    description: "Contract review workflow duration in milliseconds.",
    allowedDimensions: ["subsystem", "operation", "status", "jobType"],
    sensitivity: "internal",
    ownerRunbookArea: "contract_review"
  }),
  "enterprise_identity.sso.failure_total": metric({
    name: "enterprise_identity.sso.failure_total",
    subsystem: "enterprise_identity",
    type: "counter",
    description: "Count of future SSO readiness/login verification failures.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "providerType"],
    sensitivity: "restricted",
    ownerRunbookArea: "enterprise_identity"
  }),
  "enterprise_identity.scim.failure_total": metric({
    name: "enterprise_identity.scim.failure_total",
    subsystem: "enterprise_identity",
    type: "counter",
    description: "Count of future SCIM provisioning/deprovisioning failures.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "providerType"],
    sensitivity: "restricted",
    ownerRunbookArea: "enterprise_identity"
  }),
  "billing.entitlement.denial_total": metric({
    name: "billing.entitlement.denial_total",
    subsystem: "billing",
    type: "counter",
    description: "Count of entitlement denials by safe plan/status dimensions.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "planTier"],
    sensitivity: "restricted",
    ownerRunbookArea: "billing"
  }),
  "billing.entitlement.mismatch_total": metric({
    name: "billing.entitlement.mismatch_total",
    subsystem: "billing",
    type: "counter",
    description: "Count of detected billing snapshot/entitlement mismatches.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "planTier", "providerType"],
    sensitivity: "restricted",
    ownerRunbookArea: "billing"
  }),
  "api.error_total": metric({
    name: "api.error_total",
    subsystem: "internal_operations",
    type: "counter",
    description: "Count of API route failures by operation and category.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory"],
    sensitivity: "internal",
    ownerRunbookArea: "api"
  }),
  "background_job.retry_exhausted_total": metric({
    name: "background_job.retry_exhausted_total",
    subsystem: "internal_operations",
    type: "counter",
    description: "Count of background jobs that exhausted retry policy.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory", "jobType"],
    sensitivity: "customer_sensitive",
    ownerRunbookArea: "background_jobs"
  }),
  "audit.persistence.failure_total": metric({
    name: "audit.persistence.failure_total",
    subsystem: "internal_operations",
    type: "counter",
    description: "Count of audit event persistence failures.",
    allowedDimensions: ["subsystem", "operation", "status", "errorCategory"],
    sensitivity: "restricted",
    ownerRunbookArea: "audit_persistence"
  })
} as const satisfies Record<string, MetricContract>;

export type MetricName = keyof typeof METRIC_CONTRACTS;
export const METRIC_NAMES = Object.keys(METRIC_CONTRACTS) as MetricName[];

export function getMetricContract(metricName: string) {
  return METRIC_CONTRACTS[metricName as MetricName] ?? null;
}

export function isSafeMetricDimension(dimension: string): dimension is SafeMetricDimension {
  return SAFE_METRIC_DIMENSIONS.includes(dimension as SafeMetricDimension);
}

export function isForbiddenMetricDimension(
  dimension: string
): dimension is ForbiddenMetricDimension {
  return FORBIDDEN_METRIC_DIMENSIONS.includes(dimension as ForbiddenMetricDimension);
}
