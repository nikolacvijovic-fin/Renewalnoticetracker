import { beforeEach, describe, expect, it, vi } from "vitest";

const insertEnterpriseAuditEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/enterprise-audit/repositories/admin-enterprise-audit-repository", () => ({
  insertEnterpriseAuditEvent
}));

describe("enterprise audit recorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertEnterpriseAuditEvent.mockResolvedValue({ error: null });
  });

  it("routes trust exception events to trust_exception_approval_events", async () => {
    const { recordEnterpriseAuditEvent } = await import("@/lib/enterprise-audit/audit-recorder");

    await recordEnterpriseAuditEvent({
      organizationId: "org-1",
      contractId: "contract-1",
      actorUserId: "user-1",
      eventType: "trust_exception_approval.created",
      eventCategory: "trust_exception",
      eventSource: "contract_trust_exception_approvals",
      severity: "info",
      metadata: { raw_contract_text: "raw contract text", safeCount: 1 }
    });

    expect(insertEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "trust_exception_approval_events",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          safeCount: 1,
          event_category: "trust_exception",
          severity: "info"
        })
      })
    );
    expect(JSON.stringify(insertEnterpriseAuditEvent.mock.calls)).not.toMatch(/raw contract text/i);
  });

  it.each([
    ["trusted_reminder", "trusted_reminder_gate_events"],
    ["renewal_decision", "renewal_decision_events"],
    ["contract", "contract_audit_events"]
  ] as const)("routes %s events to %s", async (eventCategory, source) => {
    const { recordEnterpriseAuditEvent } = await import("@/lib/enterprise-audit/audit-recorder");

    await recordEnterpriseAuditEvent({
      organizationId: "org-1",
      eventType: `${eventCategory}.recorded`,
      eventCategory,
      eventSource: eventCategory,
      severity: "info",
      metadata: {}
    });

    expect(insertEnterpriseAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ source })
    );
  });

  it("best-effort mode does not throw on write failure", async () => {
    insertEnterpriseAuditEvent.mockRejectedValueOnce(new Error("database unavailable"));
    const { recordEnterpriseAuditEvent } = await import("@/lib/enterprise-audit/audit-recorder");

    await expect(
      recordEnterpriseAuditEvent({
        organizationId: "org-1",
        eventType: "trusted_reminder_gate.failed",
        eventCategory: "trusted_reminder",
        eventSource: "trusted_reminder_gate",
        severity: "warning",
        metadata: { request_body: "secret body" },
        mode: "best_effort"
      })
    ).resolves.toMatchObject({ ok: false, source: "trusted_reminder_gate_events" });
  });

  it("strict mode throws on write failure", async () => {
    insertEnterpriseAuditEvent.mockResolvedValueOnce({ error: new Error("insert failed") });
    const { recordEnterpriseAuditEvent } = await import("@/lib/enterprise-audit/audit-recorder");

    await expect(
      recordEnterpriseAuditEvent({
        organizationId: "org-1",
        eventType: "renewal_decision.created",
        eventCategory: "renewal_decision",
        eventSource: "renewal_decisions",
        severity: "info"
      })
    ).rejects.toThrow(/Enterprise audit event write failed/i);
  });

  it("requires organization scope", async () => {
    const { recordEnterpriseAuditEvent } = await import("@/lib/enterprise-audit/audit-recorder");

    await expect(
      recordEnterpriseAuditEvent({
        organizationId: " ",
        eventType: "contract.reviewed",
        eventCategory: "contract",
        eventSource: "contract_review",
        severity: "info"
      })
    ).rejects.toThrow(/organization id/i);
  });
});
