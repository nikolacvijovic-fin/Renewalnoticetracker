import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getExportRows = vi.fn();
const createAuditLog = vi.fn();
const createAdminSupabaseClient = vi.fn();
const enforceFeatureAccess = vi.fn();
const assertCanUseShippedAction = vi.fn();
const OrganizationAuthorizationError = class OrganizationAuthorizationError extends Error {};
const ActiveOrganizationRequiredError = class ActiveOrganizationRequiredError extends Error {};

vi.mock("@/lib/auth", () => ({
  getActiveOrganizationContextOrNull: getOrganizationContextOrNull,
  assertCanUseShippedAction,
  OrganizationAuthorizationError,
  ActiveOrganizationRequiredError
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getExportRows
}));

vi.mock("@/lib/contracts/export", () => ({
  toCsv: vi.fn(() => "contract_title\nMSA"),
  toXlsxBuffer: vi.fn(() => Buffer.from("xlsx"))
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/billing/entitlements", () => ({
  CommercialAccessError: class CommercialAccessError extends Error {
    constructor(
      public readonly feature: string,
      public readonly planTier = "free",
      public readonly access = { reason: "upgrade_required", message: "upgrade required", allowed: false }
    ) {
      super(feature);
    }
  },
  enforceFeatureAccess,
  getCommercialRedirectCode: vi.fn(() => "billing.export_upgrade_required")
}));

describe("export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getExportRows.mockResolvedValue([]);
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }))
    });
    enforceFeatureAccess.mockResolvedValue({});
    assertCanUseShippedAction.mockImplementation(async (context: { role: string } | null) => {
      if (!context) {
        throw new ActiveOrganizationRequiredError();
      }
      if (!["owner", "admin", "operator", "reviewer"].includes(context.role)) {
        throw new OrganizationAuthorizationError();
      }
      return context;
    });
  });

  it("enforces commercial access before csv export", async () => {
    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    await GET();

    expect(enforceFeatureAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "exports",
        context: expect.objectContaining({ format: "csv" })
      })
    );
  });

  it("rejects unknown roles before reading any export payload", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-2" },
      organizationId: "org-1",
      role: "member"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(getExportRows).not.toHaveBeenCalled();
    expect(enforceFeatureAccess).not.toHaveBeenCalled();
  });

  it("redirects safely when export access is denied", async () => {
    const { CommercialAccessError } = await import("@/lib/billing/entitlements");
    enforceFeatureAccess.mockRejectedValue(
      new CommercialAccessError("exports", "free", {
        feature: "exports",
        reason: "upgrade_required",
        message: "upgrade required",
        allowed: false
      })
    );

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    const response = await GET();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("commercial=billing.export_upgrade_required");
  });

  it("passes only the active organization into export row generation", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-tenant-safe",
      role: "owner"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    await GET();

    expect(getExportRows).toHaveBeenCalledWith("org-tenant-safe");
  });
});
