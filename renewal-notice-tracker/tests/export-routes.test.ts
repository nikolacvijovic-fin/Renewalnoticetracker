import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getExportRows = vi.fn();
const createAuditLog = vi.fn();
const createAdminSupabaseClient = vi.fn();
const enforceFeatureAccess = vi.fn();
const assertCanAccessIntelligenceSurface = vi.fn();
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

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );

  return {
    ...actual,
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
  };
});

vi.mock("@/lib/intelligence/access", () => ({
  assertCanAccessIntelligenceSurface,
  IntelligenceAuthorizationError: class IntelligenceAuthorizationError extends Error {},
  IntelligencePlanAccessError: class IntelligencePlanAccessError extends Error {}
}));

function makeRequest(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

describe("export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
    getExportRows.mockResolvedValue([]);
    createAuditLog.mockResolvedValue(undefined);
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }))
    });
    enforceFeatureAccess.mockResolvedValue({});
    assertCanAccessIntelligenceSurface.mockResolvedValue({});
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

  it("defaults to basic_contract_register and preserves commercial export gating", async () => {
    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    await GET(makeRequest("/dashboard/contracts/export/csv"));

    expect(enforceFeatureAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "exports",
        context: expect.objectContaining({
          format: "csv",
          export_preset: "basic_contract_register"
        })
      })
    );
    expect(getExportRows).toHaveBeenCalledWith("org-1", "basic_contract_register");
  });

  it("allows workflow export only through its explicit preset", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "operator-1" },
      organizationId: "org-1",
      role: "operator"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    await GET(makeRequest("/dashboard/contracts/export/csv?preset=workflow_export"));

    expect(enforceFeatureAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "risk_scores",
        context: expect.objectContaining({
          export_preset: "workflow_export"
        })
      })
    );
    expect(getExportRows).toHaveBeenCalledWith("org-1", "workflow_export");
  });

  it("blocks notes export for owners before reading any payload", async () => {
    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(
      makeRequest("/dashboard/contracts/export/csv?preset=notes_and_decisions_export")
    );

    expect(response.status).toBe(403);
    expect(getExportRows).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_denied",
        details: expect.objectContaining({
          export_preset: "notes_and_decisions_export",
          denied_reason: "role_not_allowed"
        })
      })
    );
  });

  it("requires intelligence access before reading intelligence export payload", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "reviewer-1" },
      organizationId: "org-1",
      role: "reviewer"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    await GET(makeRequest("/dashboard/contracts/export/xlsx?preset=intelligence_export"));

    expect(assertCanAccessIntelligenceSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "risk_queue"
      })
    );
    expect(getExportRows).toHaveBeenCalledWith("org-1", "intelligence_export");
  });

  it("rejects audit export because it is a deferred preset", async () => {
    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(makeRequest("/dashboard/contracts/export/csv?preset=audit_export"));

    expect(response.status).toBe(400);
    expect(getExportRows).not.toHaveBeenCalled();
    expect(enforceFeatureAccess).not.toHaveBeenCalled();
  });

  it("rejects unknown roles before reading any export payload", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-2" },
      organizationId: "org-1",
      role: "member"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(makeRequest("/dashboard/contracts/export/csv"));

    expect(response.status).toBe(403);
    expect(getExportRows).not.toHaveBeenCalled();
    expect(enforceFeatureAccess).not.toHaveBeenCalled();
  });

  it("redirects safely when export access is denied without reading payload", async () => {
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
    const response = await GET(makeRequest("/dashboard/contracts/export/xlsx"));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("commercial=billing.export_upgrade_required");
    expect(getExportRows).not.toHaveBeenCalled();
  });

  it("preserves tenant isolation by passing only the active organization into row generation", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-tenant-safe",
      role: "owner"
    });

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    await GET(makeRequest("/dashboard/contracts/export/xlsx"));

    expect(getExportRows).toHaveBeenCalledWith("org-tenant-safe", "basic_contract_register");
  });

  it("records preset, format, row count, included sections, actor, org, and sensitivity in audit evidence", async () => {
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "operator-1" },
      organizationId: "org-1",
      role: "operator"
    });
    getExportRows.mockResolvedValue([{ contract_title: "MSA" }]);

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    await GET(makeRequest("/dashboard/contracts/export/csv?preset=workflow_export"));

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "operator-1",
        action: "contracts.exported",
        details: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv",
          row_count: 1,
          included_sections: ["contract_register", "workflow", "reminders", "decisions"],
          sensitive_sections_included: false,
          exported_at: expect.any(String)
        })
      })
    );
  });
});
