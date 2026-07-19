import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";

export type EnterpriseReadinessStatus = "not_ready" | "getting_ready" | "enterprise_ready";

export type EnterpriseReadinessControl =
  | "trust_approval_immutability"
  | "server_computed_evidence_confidence"
  | "strict_rls_checks"
  | "audit_event_coverage"
  | "trusted_reminder_gate_events"
  | "approval_event_coverage"
  | "reminder_delivery_reliability"
  | "sso_scim_configured"
  | "backup_restore_status"
  | "monitoring_alerting_status"
  | "add_on_signing_configured"
  | "critical_security_events_resolved"
  | "fresh_review_approval_state";

export type EnterpriseReadinessInput = {
  trustApprovalImmutabilityPresent: boolean;
  serverComputedEvidenceConfidencePresent: boolean;
  strictRlsChecksPresent: boolean;
  auditEventCoveragePresent: boolean;
  trustedReminderGateEventCoveragePresent: boolean;
  approvalEventCoveragePresent: boolean;
  reminderDeliveryReliabilitySignalsPresent: boolean;
  ssoScimConfigured: boolean;
  backupRestoreStatusPresent: boolean;
  monitoringAlertingStatusPresent: boolean;
  addOnSigningConfigured: boolean;
  unresolvedCriticalSecurityEvents: number;
  staleReviewApprovalRisks: number;
};

export type EnterpriseReadinessResult = {
  overallScore: number;
  status: EnterpriseReadinessStatus;
  blockers: string[];
  warnings: string[];
  completedControls: EnterpriseReadinessControl[];
  nextRecommendedControl: string;
};

type ControlDefinition = {
  id: EnterpriseReadinessControl;
  label: string;
  weight: number;
  critical: boolean;
  complete: (input: EnterpriseReadinessInput) => boolean;
  warning?: (input: EnterpriseReadinessInput) => boolean;
};

const CONTROLS: ControlDefinition[] = [
  {
    id: "trust_approval_immutability",
    label: "Trust exception approvals are immutable and revocation-only.",
    weight: 12,
    critical: true,
    complete: (input) => input.trustApprovalImmutabilityPresent
  },
  {
    id: "server_computed_evidence_confidence",
    label: "Evidence confidence is computed server-side at approval time.",
    weight: 10,
    critical: true,
    complete: (input) => input.serverComputedEvidenceConfidencePresent
  },
  {
    id: "strict_rls_checks",
    label: "Strict RLS and tenant-scope checks are present for governed ledgers.",
    weight: 10,
    critical: true,
    complete: (input) => input.strictRlsChecksPresent
  },
  {
    id: "audit_event_coverage",
    label: "Enterprise audit event coverage exists across critical workflow paths.",
    weight: 8,
    critical: true,
    complete: (input) => input.auditEventCoveragePresent
  },
  {
    id: "trusted_reminder_gate_events",
    label: "Trusted reminder gate decisions are captured in audit evidence.",
    weight: 8,
    critical: true,
    complete: (input) => input.trustedReminderGateEventCoveragePresent
  },
  {
    id: "approval_event_coverage",
    label: "Trust exception approval lifecycle events are captured.",
    weight: 8,
    critical: true,
    complete: (input) => input.approvalEventCoveragePresent
  },
  {
    id: "reminder_delivery_reliability",
    label: "Reminder delivery reliability signals are visible to operators.",
    weight: 7,
    critical: false,
    complete: (input) => input.reminderDeliveryReliabilitySignalsPresent
  },
  {
    id: "sso_scim_configured",
    label: "SSO/SCIM is configured for enterprise identity.",
    weight: 7,
    critical: false,
    complete: (input) => input.ssoScimConfigured
  },
  {
    id: "backup_restore_status",
    label: "Backup and restore evidence is available.",
    weight: 7,
    critical: false,
    complete: (input) => input.backupRestoreStatusPresent
  },
  {
    id: "monitoring_alerting_status",
    label: "Monitoring and alerting status is configured.",
    weight: 7,
    critical: false,
    complete: (input) => input.monitoringAlertingStatusPresent
  },
  {
    id: "add_on_signing_configured",
    label: "Add-on service requests use internal signing.",
    weight: 5,
    critical: false,
    complete: (input) => input.addOnSigningConfigured
  },
  {
    id: "critical_security_events_resolved",
    label: "No unresolved critical security-sensitive events are present.",
    weight: 6,
    critical: true,
    complete: (input) => input.unresolvedCriticalSecurityEvents === 0
  },
  {
    id: "fresh_review_approval_state",
    label: "No stale review or approval risks are open.",
    weight: 5,
    critical: false,
    complete: (input) => input.staleReviewApprovalRisks === 0
  }
];

export function computeEnterpriseReadinessScore(
  input: EnterpriseReadinessInput
): EnterpriseReadinessResult {
  const completedControls = CONTROLS.filter((control) => control.complete(input)).map(
    (control) => control.id
  );
  const missingControls = CONTROLS.filter((control) => !control.complete(input));
  const blockers = missingControls
    .filter((control) => control.critical)
    .map((control) => control.label);
  const warnings = missingControls
    .filter((control) => !control.critical)
    .map((control) => control.label);
  const totalWeight = CONTROLS.reduce((sum, control) => sum + control.weight, 0);
  const earnedWeight = CONTROLS.filter((control) => control.complete(input)).reduce(
    (sum, control) => sum + control.weight,
    0
  );
  const overallScore = Math.round((earnedWeight / totalWeight) * 100);

  return {
    overallScore,
    status:
      blockers.length > 0
        ? "not_ready"
        : overallScore >= 90
          ? "enterprise_ready"
          : "getting_ready",
    blockers,
    warnings,
    completedControls,
    nextRecommendedControl:
      missingControls[0]?.label ?? "Maintain current controls and monitor audit coverage."
  };
}

export function buildEnterpriseReadinessInputFromAuditEvents(input: {
  events: EnterpriseAuditEvent[];
  trustApprovalImmutabilityPresent: boolean;
  serverComputedEvidenceConfidencePresent: boolean;
  strictRlsChecksPresent: boolean;
  reminderDeliveryReliabilitySignalsPresent: boolean;
  ssoScimConfigured?: boolean;
  backupRestoreStatusPresent?: boolean;
  monitoringAlertingStatusPresent?: boolean;
  addOnSigningConfigured?: boolean;
  staleReviewApprovalRisks?: number;
}): EnterpriseReadinessInput {
  const hasTrustedReminderGate = input.events.some(
    (event) => event.eventCategory === "trusted_reminder"
  );
  const hasApprovalEvents = input.events.some(
    (event) => event.eventCategory === "trust_exception"
  );
  const unresolvedCriticalSecurityEvents = input.events.filter(
    (event) => event.isSecuritySensitive && event.severity === "critical"
  ).length;

  return {
    trustApprovalImmutabilityPresent: input.trustApprovalImmutabilityPresent,
    serverComputedEvidenceConfidencePresent: input.serverComputedEvidenceConfidencePresent,
    strictRlsChecksPresent: input.strictRlsChecksPresent,
    auditEventCoveragePresent: input.events.length > 0,
    trustedReminderGateEventCoveragePresent: hasTrustedReminderGate,
    approvalEventCoveragePresent: hasApprovalEvents,
    reminderDeliveryReliabilitySignalsPresent: input.reminderDeliveryReliabilitySignalsPresent,
    ssoScimConfigured: input.ssoScimConfigured ?? false,
    backupRestoreStatusPresent: input.backupRestoreStatusPresent ?? false,
    monitoringAlertingStatusPresent: input.monitoringAlertingStatusPresent ?? false,
    addOnSigningConfigured: input.addOnSigningConfigured ?? false,
    unresolvedCriticalSecurityEvents,
    staleReviewApprovalRisks: input.staleReviewApprovalRisks ?? 0
  };
}
