import { sanitizeOperationalValue } from "@/lib/observability/server-logger";
import type {
  OperationalAlertSeverity
} from "@/lib/observability/monitoring";
import type {
  MetricName
} from "@/lib/observability/metrics";
import {
  FORBIDDEN_METRIC_DIMENSIONS,
  METRIC_CONTRACTS,
  type ForbiddenMetricDimension
} from "@/lib/observability/metrics";
import type {
  OperationalFailureCategory,
  OperationalSubsystem
} from "@/lib/observability/operational-logging";

export type AlertOperator = ">" | ">=" | "=";

export type AlertRule = {
  id: string;
  name: string;
  severity: OperationalAlertSeverity;
  subsystem: OperationalSubsystem;
  metricName: MetricName;
  operator: AlertOperator;
  threshold: number;
  timeWindowMinutes: number;
  runbookId: string;
  safeDiagnosticFields: readonly string[];
  forbiddenDiagnosticFields: readonly ForbiddenMetricDimension[];
};

function alertRule(input: Omit<AlertRule, "forbiddenDiagnosticFields">): AlertRule {
  if (!METRIC_CONTRACTS[input.metricName]) {
    throw new Error(`Unknown metric contract for alert rule ${input.id}: ${input.metricName}`);
  }

  return {
    ...input,
    forbiddenDiagnosticFields: FORBIDDEN_METRIC_DIMENSIONS
  };
}

export const ALERT_RULES = {
  reminder_dispatch_failures_above_threshold: alertRule({
    id: "reminder_dispatch_failures_above_threshold",
    name: "Reminder dispatch failures above threshold",
    severity: "P1",
    subsystem: "reminders",
    metricName: "reminder.job.failure_total",
    operator: ">=",
    threshold: 5,
    timeWindowMinutes: 15,
    runbookId: "runbook_reminder_dispatch_failures",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "jobType"]
  }),
  background_export_failures_or_retry_exhaustion: alertRule({
    id: "background_export_failures_or_retry_exhaustion",
    name: "Background export failures or retry exhaustion",
    severity: "P1",
    subsystem: "exports",
    metricName: "export.job.failure_total",
    operator: ">=",
    threshold: 3,
    timeWindowMinutes: 30,
    runbookId: "runbook_export_job_failure",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "jobType"]
  }),
  ocr_backlog_too_old: alertRule({
    id: "ocr_backlog_too_old",
    name: "OCR backlog oldest age too high",
    severity: "P1",
    subsystem: "ocr",
    metricName: "ocr.backlog.oldest_age_minutes",
    operator: ">=",
    threshold: 60,
    timeWindowMinutes: 10,
    runbookId: "runbook_ocr_queue_stuck",
    safeDiagnosticFields: ["subsystem", "operation", "status", "jobType"]
  }),
  ocr_terminal_failures_spike: alertRule({
    id: "ocr_terminal_failures_spike",
    name: "OCR terminal failures spike",
    severity: "P2",
    subsystem: "ocr",
    metricName: "ocr.job.failure_total",
    operator: ">=",
    threshold: 5,
    timeWindowMinutes: 30,
    runbookId: "runbook_ocr_queue_stuck",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "providerType"]
  }),
  sso_readiness_login_failure_spike: alertRule({
    id: "sso_readiness_login_failure_spike",
    name: "SSO readiness/login failure spike",
    severity: "P2",
    subsystem: "enterprise_identity",
    metricName: "enterprise_identity.sso.failure_total",
    operator: ">=",
    threshold: 5,
    timeWindowMinutes: 30,
    runbookId: "runbook_sso_readiness_login_failures",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "providerType"]
  }),
  scim_provisioning_failure_spike: alertRule({
    id: "scim_provisioning_failure_spike",
    name: "SCIM provisioning/deprovisioning failure spike",
    severity: "P2",
    subsystem: "enterprise_identity",
    metricName: "enterprise_identity.scim.failure_total",
    operator: ">=",
    threshold: 5,
    timeWindowMinutes: 30,
    runbookId: "runbook_scim_provisioning_failures",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "providerType"]
  }),
  billing_webhook_failure_spike: alertRule({
    id: "billing_webhook_failure_spike",
    name: "Billing webhook failure spike",
    severity: "P1",
    subsystem: "billing",
    metricName: "api.error_total",
    operator: ">=",
    threshold: 3,
    timeWindowMinutes: 15,
    runbookId: "runbook_billing_webhook_failures",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "providerType"]
  }),
  billing_entitlement_mismatch_spike: alertRule({
    id: "billing_entitlement_mismatch_spike",
    name: "Billing entitlement mismatch spike",
    severity: "P1",
    subsystem: "billing",
    metricName: "billing.entitlement.mismatch_total",
    operator: ">=",
    threshold: 2,
    timeWindowMinutes: 30,
    runbookId: "runbook_billing_entitlement_mismatch",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "planTier", "providerType"]
  }),
  audit_event_persistence_failure: alertRule({
    id: "audit_event_persistence_failure",
    name: "Audit event persistence failure",
    severity: "P0",
    subsystem: "internal_operations",
    metricName: "audit.persistence.failure_total",
    operator: ">=",
    threshold: 1,
    timeWindowMinutes: 5,
    runbookId: "runbook_audit_event_persistence_failure",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory"]
  }),
  tenant_isolation_export_authorization_anomaly: alertRule({
    id: "tenant_isolation_export_authorization_anomaly",
    name: "Tenant isolation or export authorization anomaly",
    severity: "P0",
    subsystem: "exports",
    metricName: "api.error_total",
    operator: ">=",
    threshold: 1,
    timeWindowMinutes: 5,
    runbookId: "runbook_tenant_isolation_export_authorization",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "planTier"]
  }),
  background_job_retry_exhaustion: alertRule({
    id: "background_job_retry_exhaustion",
    name: "Background job retry exhaustion",
    severity: "P1",
    subsystem: "internal_operations",
    metricName: "background_job.retry_exhausted_total",
    operator: ">=",
    threshold: 3,
    timeWindowMinutes: 30,
    runbookId: "runbook_background_job_retry_exhaustion",
    safeDiagnosticFields: ["subsystem", "operation", "status", "errorCategory", "jobType"]
  })
} as const satisfies Record<string, AlertRule>;

export type AlertRuleId = keyof typeof ALERT_RULES;
export const ALERT_RULE_IDS = Object.keys(ALERT_RULES) as AlertRuleId[];

export type IncidentSnapshotInput = {
  subsystem: OperationalSubsystem;
  alertRuleId: AlertRuleId;
  severity: OperationalAlertSeverity;
  affectedOrganizationCount?: number | null;
  affectedJobCount?: number | null;
  oldestFailedOrStuckAgeMinutes?: number | null;
  retryExhaustedCount?: number | null;
  recentSafeEventIds?: readonly string[];
  failureCategory?: OperationalFailureCategory | null;
  runbookId: string;
  safeMetadata?: Record<string, unknown>;
};

export type IncidentSnapshot = {
  signalType: "incident_snapshot";
  subsystem: OperationalSubsystem;
  alertRuleId: AlertRuleId;
  severity: OperationalAlertSeverity;
  affectedOrganizationCount: number | null;
  affectedJobCount: number | null;
  oldestFailedOrStuckAgeMinutes: number | null;
  retryExhaustedCount: number | null;
  recentSafeEventIds: readonly string[];
  failureCategory: OperationalFailureCategory | null;
  runbookId: string;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
};

export function buildIncidentSnapshot(input: IncidentSnapshotInput): IncidentSnapshot {
  return {
    signalType: "incident_snapshot",
    subsystem: input.subsystem,
    alertRuleId: input.alertRuleId,
    severity: input.severity,
    affectedOrganizationCount: input.affectedOrganizationCount ?? null,
    affectedJobCount: input.affectedJobCount ?? null,
    oldestFailedOrStuckAgeMinutes: input.oldestFailedOrStuckAgeMinutes ?? null,
    retryExhaustedCount: input.retryExhaustedCount ?? null,
    recentSafeEventIds: input.recentSafeEventIds?.slice(0, 25) ?? [],
    failureCategory: input.failureCategory ?? null,
    runbookId: input.runbookId,
    safeMetadata: sanitizeOperationalValue(input.safeMetadata ?? {}) as Record<string, unknown>,
    createdAt: new Date().toISOString()
  };
}

export function getAlertRule(ruleId: string) {
  return ALERT_RULES[ruleId as AlertRuleId] ?? null;
}
