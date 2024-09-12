import { describe, expect, it } from "vitest";
import { getEnterpriseReadinessEvidence } from "@/lib/enterprise-readiness/enterprise-readiness-evidence";
import { computeEnterpriseReadinessScore } from "@/lib/enterprise-readiness/enterprise-readiness-score";
import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";

function event(overrides: Partial<EnterpriseAuditEvent>): EnterpriseAuditEvent {
  return {
    id: "trusted_reminder_gate_events:event-1",
    organizationId: "org-1",
    contractId: "contract-1",
    actorUserId: "user-1",
    actorLabel: "user-1",
    eventType: "trusted_reminder_gate.allowed",
    eventCategory: "trusted_reminder",
    eventSource: "trusted_reminder_gate_events",
    severity: "info",
    summary: "Allowed",
    metadata: {},
    createdAt: "2026-07-19T00:00:00.000Z",
    isSecuritySensitive: false,
    isTrustSensitive: true,
    isExportable: true,
    ...overrides
  };
}

describe("enterprise readiness evidence", () => {
  it("fails coverage when enterprise audit events are missing", async () => {
    const result = await getEnterpriseReadinessEvidence("org-1", {
      events: [],
      addOnSigningConfigured: true,
      monitoringAlertingStatusPresent: true
    });

    expect(result.evidence.find((item) => item.controlId === "audit_event_coverage")).toMatchObject({
      status: "failed"
    });
    expect(computeEnterpriseReadinessScore(result.scoreInput).status).toBe("not_ready");
  });

  it("fails trusted reminder coverage when gate events are missing", async () => {
    const result = await getEnterpriseReadinessEvidence("org-1", {
      events: [event({ eventCategory: "trust_exception", eventSource: "trust_exception_approval_events" })]
    });

    expect(result.evidence.find((item) => item.controlId === "trusted_reminder_gate_events")).toMatchObject({
      status: "failed"
    });
  });

  it("blocks enterprise_ready when critical security events are unresolved", async () => {
    const result = await getEnterpriseReadinessEvidence("org-1", {
      events: [
        event({ eventCategory: "trusted_reminder" }),
        event({ id: "trust_exception_approval_events:event-2", eventCategory: "trust_exception", eventSource: "trust_exception_approval_events" }),
        event({
          id: "audit_logs:event-3",
          eventCategory: "admin",
          eventSource: "audit_logs",
          severity: "critical",
          isSecuritySensitive: true
        })
      ],
      addOnSigningConfigured: true,
      monitoringAlertingStatusPresent: true,
      backupRestoreStatusPresent: true,
      ssoScimConfigured: true
    });

    expect(result.scoreInput.unresolvedCriticalSecurityEvents).toBe(1);
    expect(computeEnterpriseReadinessScore(result.scoreInput).status).toBe("not_ready");
  });

  it("warns when add-on signing is missing", async () => {
    const result = await getEnterpriseReadinessEvidence("org-1", {
      events: [
        event({ eventCategory: "trusted_reminder" }),
        event({ id: "trust_exception_approval_events:event-2", eventCategory: "trust_exception", eventSource: "trust_exception_approval_events" })
      ],
      addOnSigningConfigured: false,
      monitoringAlertingStatusPresent: true,
      backupRestoreStatusPresent: true,
      ssoScimConfigured: true
    });

    expect(result.evidence.find((item) => item.controlId === "add_on_signing_configured")).toMatchObject({
      status: "warning"
    });
    expect(computeEnterpriseReadinessScore(result.scoreInput).status).not.toBe("enterprise_ready");
  });
});
