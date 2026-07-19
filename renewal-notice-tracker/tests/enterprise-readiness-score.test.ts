import { describe, expect, it } from "vitest";
import {
  buildEnterpriseReadinessInputFromAuditEvents,
  computeEnterpriseReadinessScore
} from "@/lib/enterprise-readiness/enterprise-readiness-score";
import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";

function baseInput() {
  return {
    trustApprovalImmutabilityPresent: true,
    serverComputedEvidenceConfidencePresent: true,
    strictRlsChecksPresent: true,
    auditEventCoveragePresent: true,
    trustedReminderGateEventCoveragePresent: true,
    approvalEventCoveragePresent: true,
    reminderDeliveryReliabilitySignalsPresent: true,
    ssoScimConfigured: true,
    backupRestoreStatusPresent: true,
    monitoringAlertingStatusPresent: true,
    addOnSigningConfigured: true,
    unresolvedCriticalSecurityEvents: 0,
    staleReviewApprovalRisks: 0
  };
}

describe("enterprise readiness score", () => {
  it("fails when approval immutability is missing", () => {
    const result = computeEnterpriseReadinessScore({
      ...baseInput(),
      trustApprovalImmutabilityPresent: false
    });

    expect(result.status).toBe("not_ready");
    expect(result.blockers.join(" ")).toMatch(/immutable/i);
  });

  it("fails when server-computed evidence confidence is missing", () => {
    const result = computeEnterpriseReadinessScore({
      ...baseInput(),
      serverComputedEvidenceConfidencePresent: false
    });

    expect(result.status).toBe("not_ready");
    expect(result.nextRecommendedControl).toMatch(/Evidence confidence/i);
  });

  it("warns when add-on signing is missing without hiding critical readiness", () => {
    const result = computeEnterpriseReadinessScore({
      ...baseInput(),
      addOnSigningConfigured: false
    });

    expect(result.status).toBe("getting_ready");
    expect(result.warnings.join(" ")).toMatch(/Add-on service requests/i);
  });

  it("reaches enterprise_ready only when critical controls are complete", () => {
    expect(computeEnterpriseReadinessScore(baseInput()).status).toBe("enterprise_ready");
  });

  it("builds readiness input from normalized audit events", () => {
    const events: EnterpriseAuditEvent[] = [
      {
        id: "trusted_reminder_gate_events:1",
        organizationId: "org-1",
        contractId: "contract-1",
        actorUserId: null,
        actorLabel: "System",
        eventType: "trusted_reminder_gate.allowed",
        eventCategory: "trusted_reminder",
        eventSource: "trusted_reminder_gate_events",
        severity: "info",
        summary: "Gate allowed",
        metadata: {},
        createdAt: "2026-07-01T00:00:00.000Z",
        isSecuritySensitive: false,
        isTrustSensitive: true,
        isExportable: true
      },
      {
        id: "trust_exception_approval_events:1",
        organizationId: "org-1",
        contractId: "contract-1",
        actorUserId: "admin-1",
        actorLabel: "admin-1",
        eventType: "trust_exception_approval.created",
        eventCategory: "trust_exception",
        eventSource: "trust_exception_approval_events",
        severity: "info",
        summary: "Approved",
        metadata: {},
        createdAt: "2026-07-01T00:00:00.000Z",
        isSecuritySensitive: false,
        isTrustSensitive: true,
        isExportable: true
      }
    ];

    expect(
      buildEnterpriseReadinessInputFromAuditEvents({
        events,
        trustApprovalImmutabilityPresent: true,
        serverComputedEvidenceConfidencePresent: true,
        strictRlsChecksPresent: true,
        reminderDeliveryReliabilitySignalsPresent: true
      })
    ).toMatchObject({
      auditEventCoveragePresent: true,
      trustedReminderGateEventCoveragePresent: true,
      approvalEventCoveragePresent: true
    });
  });
});
