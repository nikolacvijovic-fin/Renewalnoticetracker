import { beforeEach, describe, expect, it, vi } from "vitest";

const getActiveOrganizationContextOrNull = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const getExportRows = vi.fn();

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
    expect(json.schemaVersion).toBe("noticecontrol.customer_export.v1");
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
