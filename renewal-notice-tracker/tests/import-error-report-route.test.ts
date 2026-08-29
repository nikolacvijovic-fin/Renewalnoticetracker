import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const getScopedImportJobErrorReport = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/import-jobs", () => ({
  getScopedImportJobErrorReport
}));

describe("import error report route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      organizationId: "org-1",
      user: { id: "user-1" },
      role: "operator"
    });
    getScopedImportJobErrorReport.mockResolvedValue({
      id: "job-1",
      file_name: "contracts.xlsx",
      status: "needs_cleanup",
      row_count: 4,
      imported_count: 2,
      errors: [
        {
          row: 3,
          status: "failed",
          contract_title: "Bad Contract",
          counterparty_name: "Acme",
          owner_email: null,
          field: "notice_deadline_date",
          error: "Invalid date",
          warnings: []
        }
      ]
    });
  });

  it("exports only the active organization's row-level import rescue report", async () => {
    const { GET } = await import("@/app/dashboard/contracts/imports/[id]/errors/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "job-1" })
    });

    expect(getScopedImportJobErrorReport).toHaveBeenCalledWith("job-1", "org-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    const body = await response.text();
    expect(body).toContain("status");
    expect(body).toContain("failed");
    expect(body).toContain("notice_deadline_date");
  });
});
