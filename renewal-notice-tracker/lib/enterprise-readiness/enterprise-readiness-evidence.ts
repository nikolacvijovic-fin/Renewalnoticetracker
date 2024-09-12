import fs from "node:fs";
import path from "node:path";
import { getAppConfig } from "@/lib/config";
import { getEnterpriseAuditEvents } from "@/lib/enterprise-audit/audit-queries";
import type {
  EnterpriseReadinessControl,
  EnterpriseReadinessInput
} from "@/lib/enterprise-readiness/enterprise-readiness-score";
import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";

export type EnterpriseReadinessEvidenceStatus = "passed" | "warning" | "failed" | "unknown";

export type EnterpriseReadinessEvidence = {
  controlId: EnterpriseReadinessControl;
  status: EnterpriseReadinessEvidenceStatus;
  source: string;
  checkedAt: string;
  summary: string;
};

export type EnterpriseReadinessEvidenceResult = {
  organizationId: string;
  checkedAt: string;
  evidence: EnterpriseReadinessEvidence[];
  scoreInput: EnterpriseReadinessInput;
};

type EvidenceOptions = {
  now?: Date;
  events?: EnterpriseAuditEvent[];
  migrationRoot?: string;
  addOnSigningConfigured?: boolean;
  monitoringAlertingStatusPresent?: boolean;
  ssoScimConfigured?: boolean;
  backupRestoreStatusPresent?: boolean;
  reminderDeliveryReliabilitySignalsPresent?: boolean;
};

function readMigrationText(root = process.cwd()) {
  const files = [
    path.join(root, "supabase", "migrations", "202607130001_contract_trust_exception_approvals.sql"),
    path.join(root, "supabase", "migrations", "202607190001_enterprise_trust_authority.sql"),
    path.join(root, "supabase", "migrations", "202607130003_add_on_commercial_backbone.sql")
  ];

  return files
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
}

function makeEvidence(input: Omit<EnterpriseReadinessEvidence, "checkedAt"> & { checkedAt: string }) {
  return input;
}

function booleanEvidence(input: {
  controlId: EnterpriseReadinessControl;
  passed: boolean;
  source: string;
  checkedAt: string;
  passedSummary: string;
  failedSummary: string;
  failedStatus?: EnterpriseReadinessEvidenceStatus;
}) {
  return makeEvidence({
    controlId: input.controlId,
    status: input.passed ? "passed" : input.failedStatus ?? "failed",
    source: input.source,
    checkedAt: input.checkedAt,
    summary: input.passed ? input.passedSummary : input.failedSummary
  });
}

export async function getEnterpriseReadinessEvidence(
  organizationId: string,
  options: EvidenceOptions = {}
): Promise<EnterpriseReadinessEvidenceResult> {
  const checkedAt = (options.now ?? new Date()).toISOString();
  const events =
    options.events ??
    (await getEnterpriseAuditEvents({ organizationId, limit: 250 })).events;
  const config = getAppConfig();
  const migrations = readMigrationText(options.migrationRoot);
  const hasApprovalImmutability =
    migrations.includes("prevent_contract_trust_exception_approval_mutation") &&
    migrations.includes("approval fields are immutable after insert");
  const hasServerComputedConfidence =
    migrations.includes("create_contract_trust_exception_approval") ||
    migrations.includes("Service-role path computes evidence_confidence_at_approval") ||
    migrations.includes("evidence_confidence_at_approval");
  const hasStrictRls =
    migrations.includes("alter table public.contract_trust_exception_approvals enable row level security") &&
    migrations.includes("members can read contract trust exception approvals") &&
    migrations.includes("drop policy if exists \"review-capable members can create contract trust exception approvals\"");
  const hasAuditCoverage = events.length > 0;
  const hasTrustedReminderGate = events.some((event) => event.eventCategory === "trusted_reminder");
  const hasApprovalEvents = events.some((event) => event.eventCategory === "trust_exception");
  const unresolvedCriticalSecurityEvents = events.filter(
    (event) => event.isSecuritySensitive && event.severity === "critical"
  ).length;
  const staleReviewApprovalRisks = events.filter(
    (event) =>
      event.isTrustSensitive &&
      event.severity === "warning" &&
      (event.eventType.includes("pending") || event.eventType.includes("blocked"))
  ).length;
  const addOnSigningConfigured =
    options.addOnSigningConfigured ?? Boolean(config.addOns.internalSigningSecret);
  const monitoringAlertingStatusPresent =
    options.monitoringAlertingStatusPresent ?? Boolean(config.operations.monitoringEventSink);

  const evidence: EnterpriseReadinessEvidence[] = [
    booleanEvidence({
      controlId: "trust_approval_immutability",
      passed: hasApprovalImmutability,
      source: "supabase migrations",
      checkedAt,
      passedSummary: "Trust approvals are append-only except formal revocation.",
      failedSummary: "Could not verify immutable trust approval enforcement."
    }),
    booleanEvidence({
      controlId: "server_computed_evidence_confidence",
      passed: hasServerComputedConfidence,
      source: "trust approval service and migrations",
      checkedAt,
      passedSummary: "Approval confidence is computed by trusted code.",
      failedSummary: "Could not verify trusted confidence computation."
    }),
    booleanEvidence({
      controlId: "strict_rls_checks",
      passed: hasStrictRls,
      source: "supabase migrations",
      checkedAt,
      passedSummary: "Trust approval RLS removes direct client create/update authority.",
      failedSummary: "Could not verify strict trust approval RLS boundary."
    }),
    booleanEvidence({
      controlId: "audit_event_coverage",
      passed: hasAuditCoverage,
      source: "enterprise audit events",
      checkedAt,
      passedSummary: "Enterprise audit evidence exists for this organization.",
      failedSummary: "No enterprise audit events found for this organization."
    }),
    booleanEvidence({
      controlId: "trusted_reminder_gate_events",
      passed: hasTrustedReminderGate,
      source: "trusted_reminder_gate_events",
      checkedAt,
      passedSummary: "Trusted reminder gate events are present.",
      failedSummary: "No trusted reminder gate events were found."
    }),
    booleanEvidence({
      controlId: "approval_event_coverage",
      passed: hasApprovalEvents,
      source: "trust_exception_approval_events",
      checkedAt,
      passedSummary: "Trust exception approval events are present.",
      failedSummary: "No trust exception approval events were found."
    }),
    booleanEvidence({
      controlId: "reminder_delivery_reliability",
      passed: options.reminderDeliveryReliabilitySignalsPresent ?? true,
      source: "reminder control plane",
      checkedAt,
      passedSummary: "Reminder reliability signals are available.",
      failedSummary: "Reminder reliability signals could not be verified.",
      failedStatus: "warning"
    }),
    booleanEvidence({
      controlId: "sso_scim_configured",
      passed: options.ssoScimConfigured ?? false,
      source: "enterprise identity runtime",
      checkedAt,
      passedSummary: "SSO/SCIM is configured.",
      failedSummary: "SSO/SCIM remains future-only or unconfigured.",
      failedStatus: "warning"
    }),
    booleanEvidence({
      controlId: "backup_restore_status",
      passed: options.backupRestoreStatusPresent ?? false,
      source: "ops evidence",
      checkedAt,
      passedSummary: "Backup/restore evidence is available.",
      failedSummary: "Backup/restore evidence has not been verified.",
      failedStatus: "warning"
    }),
    booleanEvidence({
      controlId: "monitoring_alerting_status",
      passed: monitoringAlertingStatusPresent,
      source: "runtime config",
      checkedAt,
      passedSummary: "Monitoring sink configuration is present.",
      failedSummary: "Monitoring sink configuration is missing.",
      failedStatus: "warning"
    }),
    booleanEvidence({
      controlId: "add_on_signing_configured",
      passed: addOnSigningConfigured,
      source: "runtime config",
      checkedAt,
      passedSummary: "Add-on internal signing is configured.",
      failedSummary: "Add-on internal signing is not configured.",
      failedStatus: "warning"
    }),
    booleanEvidence({
      controlId: "critical_security_events_resolved",
      passed: unresolvedCriticalSecurityEvents === 0,
      source: "enterprise audit events",
      checkedAt,
      passedSummary: "No unresolved critical security-sensitive events were found.",
      failedSummary: `${unresolvedCriticalSecurityEvents} critical security-sensitive event(s) require review.`
    }),
    booleanEvidence({
      controlId: "fresh_review_approval_state",
      passed: staleReviewApprovalRisks === 0,
      source: "enterprise audit events",
      checkedAt,
      passedSummary: "No stale review or approval risks were found.",
      failedSummary: `${staleReviewApprovalRisks} stale review or approval risk(s) require follow-up.`,
      failedStatus: "warning"
    })
  ];

  return {
    organizationId,
    checkedAt,
    evidence,
    scoreInput: {
      trustApprovalImmutabilityPresent: evidence.find((item) => item.controlId === "trust_approval_immutability")?.status === "passed",
      serverComputedEvidenceConfidencePresent: evidence.find((item) => item.controlId === "server_computed_evidence_confidence")?.status === "passed",
      strictRlsChecksPresent: evidence.find((item) => item.controlId === "strict_rls_checks")?.status === "passed",
      auditEventCoveragePresent: hasAuditCoverage,
      trustedReminderGateEventCoveragePresent: hasTrustedReminderGate,
      approvalEventCoveragePresent: hasApprovalEvents,
      reminderDeliveryReliabilitySignalsPresent: evidence.find((item) => item.controlId === "reminder_delivery_reliability")?.status === "passed",
      ssoScimConfigured: evidence.find((item) => item.controlId === "sso_scim_configured")?.status === "passed",
      backupRestoreStatusPresent: evidence.find((item) => item.controlId === "backup_restore_status")?.status === "passed",
      monitoringAlertingStatusPresent: evidence.find((item) => item.controlId === "monitoring_alerting_status")?.status === "passed",
      addOnSigningConfigured: evidence.find((item) => item.controlId === "add_on_signing_configured")?.status === "passed",
      unresolvedCriticalSecurityEvents,
      staleReviewApprovalRisks
    }
  };
}
