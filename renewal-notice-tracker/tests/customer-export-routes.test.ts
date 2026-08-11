import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveOrganizationContextOrNull = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const getExportRows = vi.fn();
const auditLogsLimit = vi.fn();
const auditLogsOrder = vi.fn(() => ({ limit: auditLogsLimit }));
const auditLogsEq = vi.fn(() => ({ order: auditLogsOrder }));
const auditLogsSelect = vi.fn(() => ({ eq: auditLogsEq }));
const fromMock = vi.fn(() => ({ select: auditLogsSelect }));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    getActiveOrganizationContextOrNull
  };
});

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getExportRows
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({
    from: fromMock
  })
}));

describe("customer export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExportRows.mockResolvedValue([
      {
        contract_title: "Acme MSA",
        counterparty_name: "Acme",
        notice_deadline_date: "2026-08-15",
        renewal_date: "2026-09-15",
        expiration_date: "2026-09-15",
        auto_renewal: "Yes",
        owner_name: "Finance Owner",
        department: "Finance",
        needs_review: "No",
        renewal_decision_status: "pending",
        raw_contract_text: "raw contract text",
        provider_payload: "provider payload"
      }
    ]);
    auditLogsLimit.mockResolvedValue({
      data: [
        {
          actor_user_id: "admin-1",
          entity_type: "contract",
          entity_id: "contract-1",
          action: "contract.reviewed",
          details: {
            fromStatus: "needs_review",
            rawContractText: "raw contract text",
            provider_payload: "provider payload",
            privateNote: "private note"
          },
          created_at: "2026-08-09T00:00:00.000Z"
        }
      ],
      error: null
    });
  });

  it("blocks non-admin/operator users from full customer JSON export before assembling data", async () => {
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "owner-1" },
      organizationId: "org-1",
      role: "owner"
    });
    const { GET } = await import("@/app/dashboard/exports/customer-data.json/route");

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getExportRows).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "export.created" })
    );
  }, 10000);

  it("returns safe JSON and records export-created metadata for admin users", async () => {
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "admin-1" },
      organizationId: "org-1",
      role: "admin"
    });
    const { GET } = await import("@/app/dashboard/exports/customer-data.json/route");

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(getExportRows).toHaveBeenCalledWith("org-1", "basic_contract_register");
    expect(fromMock).toHaveBeenCalledWith("audit_logs");
    expect(auditLogsEq).toHaveBeenCalledWith("organization_id", "org-1");
    expect(auditLogsLimit).toHaveBeenCalledWith(250);
    expect(json.schemaVersion).toBe("noticecontrol.customer_export.v1");
    expect(json.datasets.auditSafeHistory).toHaveLength(1);
    expect(json.datasets.auditSafeHistory[0].safe_metadata).toContain("fromStatus");
    expect(serialized).not.toContain("raw contract text");
    expect(serialized).not.toContain("provider payload");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "admin-1",
        action: "export.created",
        entityType: "export",
        details: expect.objectContaining({
          export_type: "customer_data_export",
          format: "json",
          row_counts: expect.objectContaining({ renewalDeadlineRegister: 1 })
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toContain("raw contract text");
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "admin-1",
        eventName: "export_requested"
      })
    );
  });

  it("returns the advertised customer workbook route with expanded safe datasets", async () => {
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "admin-1" },
      organizationId: "org-1",
      role: "admin"
    });
    const { GET } = await import("@/app/dashboard/exports/customer-data.xlsx/route");

    const response = await GET();
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(body.length).toBeGreaterThan(1000);
    expect(getExportRows).toHaveBeenCalledWith("org-1", "basic_contract_register");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "export.created",
        details: expect.objectContaining({
          export_type: "customer_data_export",
          format: "xlsx",
          row_counts: expect.objectContaining({
            ownerActionList: 1,
            riskFindings: expect.any(Number),
            auditSafeHistory: 1
          })
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls)).not.toMatch(/raw contract text|provider payload|private note/i);
  });

  it("returns a leadership PDF report without raw exported content", async () => {
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "operator-1" },
      organizationId: "org-1",
      role: "operator"
    });
    const { GET } = await import("@/app/dashboard/exports/leadership-summary.pdf/route");

    const response = await GET();
    const body = Buffer.from(await response.arrayBuffer()).toString("utf8");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/pdf");
    expect(body).toContain("%PDF-1.4");
    expect(body).toContain("NoticeControl Leadership Renewal Summary");
    expect(body).not.toContain("raw contract text");
    expect(body).not.toContain("provider payload");
  });
});
