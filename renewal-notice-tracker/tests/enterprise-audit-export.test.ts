import { beforeEach, describe, expect, it, vi } from "vitest";

const createAuditLog = vi.hoisted(() => vi.fn());
const getEnterpriseAuditEvents = vi.hoisted(() => vi.fn());

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/enterprise-audit/audit-queries", () => ({
  getEnterpriseAuditEvents
}));

describe("enterprise audit export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAuditLog.mockResolvedValue({ ok: true });
    getEnterpriseAuditEvents.mockResolvedValue({
      events: [
        {
          id: "audit_logs:audit-1",
          organizationId: "org-1",
          contractId: "contract-1",
          actorUserId: "user-1",
          actorLabel: "user-1",
          eventType: "contracts.exported",
          eventCategory: "export",
          eventSource: "audit_logs",
          severity: "info",
          summary: "Contracts exported",
          metadata: { format: "csv" },
          createdAt: "2026-07-01T00:00:00.000Z",
          isSecuritySensitive: true,
          isTrustSensitive: false,
          isExportable: true
        }
      ]
    });
  });

  it("exports redacted JSON and records a safe audit event", async () => {
    const { exportEnterpriseAuditEvents } = await import("@/lib/enterprise-audit/audit-export");
    const result = await exportEnterpriseAuditEvents({
      organizationId: "org-1",
      actorUserId: "admin-1",
      internalRole: "internal_admin",
      format: "json",
      limit: 50
    });

    expect(result.rowCount).toBe(1);
    expect(result.content).toContain("Contracts exported");
    expect(result.content).not.toMatch(/raw contract|provider payload|secret|token/i);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "admin-1",
        action: "enterprise_audit.exported",
        entityType: "enterprise_audit_export",
        details: expect.objectContaining({
          format: "json",
          row_count: 1
        })
      }),
      { mode: "best_effort" }
    );
  });

  it("exports CSV with safe columns only", async () => {
    const { exportEnterpriseAuditEvents } = await import("@/lib/enterprise-audit/audit-export");
    const result = await exportEnterpriseAuditEvents({
      organizationId: "org-1",
      actorUserId: "admin-1",
      internalRole: "internal_support",
      format: "csv",
      securitySensitiveOnly: true
    });

    expect(result.content.split("\n")[0]).toContain("eventCategory");
    expect(result.content).toContain("contracts.exported");
    expect(getEnterpriseAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        securitySensitiveOnly: true
      })
    );
  });

  it("requires an internal role before exporting audit evidence", async () => {
    const { exportEnterpriseAuditEvents } = await import("@/lib/enterprise-audit/audit-export");

    await expect(
      exportEnterpriseAuditEvents({
        organizationId: "org-1",
        actorUserId: "user-1",
        internalRole: "admin" as never,
        format: "json"
      })
    ).rejects.toThrow(/internal admin or support role/i);

    expect(getEnterpriseAuditEvents).not.toHaveBeenCalled();
  });
});
