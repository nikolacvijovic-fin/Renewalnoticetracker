import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeActiveOrganizationContext } from "./factories/domain";
import { expectEntitlementDeniedResponse } from "./helpers/domain-assertions";

const getOrganizationContextOrNull = vi.fn();
const getExportRows = vi.fn();
const createAuditLog = vi.fn();
const createAdminSupabaseClient = vi.fn();
const enforceFeatureAccess = vi.fn();
const assertCanAccessIntelligenceSurface = vi.fn();
const assertCanUseShippedAction = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const emitOperationalEvent = vi.fn();
const logServerError = vi.fn();
const logServerInfo = vi.fn();
const logServerWarn = vi.fn();
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

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
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

vi.mock("@/lib/observability/server-logger", () => ({
  logServerError,
  logServerInfo,
  logServerWarn
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

function makeRequest(path: string) {
  return new Request(`http://localhost:3000${path}`);
}

describe("export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue(makeActiveOrganizationContext());
    getExportRows.mockResolvedValue([]);
    createAuditLog.mockResolvedValue(undefined);
    trackServerAnalyticsEvent.mockResolvedValue({ inserted: true });
    emitOperationalEvent.mockResolvedValue({});
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }))
    });
    enforceFeatureAccess.mockResolvedValue({
      billingSnapshot: {
        organizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        trialEndsAt: null,
        currentPeriodEnd: null
      },
      accessResult: {
        allowed: true,
        feature: "exports",
        reason: "allowed",
        message: "Allowed"
      }
    });
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
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );

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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_rejected",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_preset: "notes_and_decisions_export",
          format: "csv",
          denied_reason: "forbidden"
        })
      })
    );
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
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "reviewer-1" },
        role: "reviewer"
      })
    );

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
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "user-2" },
        role: "member"
      })
    );

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

    await expectEntitlementDeniedResponse(response);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("commercial=billing.export_upgrade_required");
    expect(getExportRows).not.toHaveBeenCalled();
  });

  it("preserves tenant isolation by passing only the active organization into row generation", async () => {
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        organizationId: "org-tenant-safe"
      })
    );

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    await GET(makeRequest("/dashboard/contracts/export/xlsx"));

    expect(getExportRows).toHaveBeenCalledWith("org-tenant-safe", "basic_contract_register");
  });

  it("records preset, format, row count, included sections, actor, org, and sensitivity in audit evidence", async () => {
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_attempted",
        organizationId: "org-1",
        actorUserId: "operator-1",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_completed",
        organizationId: "org-1",
        actorUserId: "operator-1",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv",
          row_count: 1
        })
      })
    );
  });

  it("returns a safe structured error and logs export failures without exposing payload details", async () => {
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockRejectedValue(
      new Error("raw contract text, full note, and extracted evidence should not leak")
    );

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(
      makeRequest("/dashboard/contracts/export/csv?preset=workflow_export")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        error: "Export could not be completed.",
        code: "ERR_EXPORT_FAILED_001",
        requestId: expect.any(String)
      })
    );
    expect(JSON.stringify(body)).not.toContain("raw contract text");
    expect(JSON.stringify(body)).not.toContain("full note");
    expect(JSON.stringify(body)).not.toContain("extracted evidence");
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "export_failed",
        organizationId: "org-1",
        actorUserId: "operator-1",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_failed",
        severity: "P2",
        alert: true,
        organizationId: "org-1",
        actorUserId: "operator-1",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
  });

  it("returns a safe 413 when a synchronous export exceeds the row limit", async () => {
    const { ExportScaleLimitError, EXPORT_SYNC_ROW_LIMIT } = await import("@/lib/contracts/export");
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockRejectedValue(
      new ExportScaleLimitError({
        presetId: "workflow_export",
        rowCount: EXPORT_SYNC_ROW_LIMIT + 1,
        maxRows: EXPORT_SYNC_ROW_LIMIT
      })
    );

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(
      makeRequest("/dashboard/contracts/export/csv?preset=workflow_export")
    );
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body).toEqual(
      expect.objectContaining({
        error: expect.stringContaining("too large for synchronous download"),
        code: "ERR_EXPORT_BACKGROUND_REQUIRED_001",
        maxRows: EXPORT_SYNC_ROW_LIMIT,
        requestId: expect.any(String),
        backgroundExport: {
          method: "POST",
          path: "/api/exports/contracts",
          preset: "workflow_export",
          format: "csv"
        }
      })
    );
    expect(logServerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "export_too_large",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          row_count: EXPORT_SYNC_ROW_LIMIT + 1,
          max_rows: EXPORT_SYNC_ROW_LIMIT
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_rejected",
        organizationId: "org-1",
        actorUserId: "operator-1",
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "csv",
          rejected_reason: "sync_row_limit",
          row_count: EXPORT_SYNC_ROW_LIMIT + 1
        })
      })
    );
  });

  it("rejects oversized rich XLSX before persistence or workbook generation while CSV remains viable", async () => {
    const { EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT } = await import("@/lib/contracts/export");
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockResolvedValue(
      Array.from({ length: EXPORT_XLSX_TEXT_HEAVY_ROW_LIMIT + 1 }, (_, index) => ({
        contract_title: `MSA ${index}`,
        latest_note_preview: "bounded note",
        decision_history_summary: "bounded decision summary"
      }))
    );

    const { GET: getXlsx } = await import("@/app/dashboard/contracts/export/xlsx/route");
    const xlsxResponse = await getXlsx(
      makeRequest("/dashboard/contracts/export/xlsx?preset=notes_and_decisions_export")
    );
    const xlsxBody = await xlsxResponse.json();

    expect(xlsxResponse.status).toBe(413);
    expect(xlsxBody).toEqual(
      expect.objectContaining({
        code: "ERR_EXPORT_XLSX_TOO_LARGE_001",
        recommendation: "csv_or_smaller_export"
      })
    );
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(logServerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "export_preflight_rejected",
        metadata: expect.objectContaining({
          export_preset: "notes_and_decisions_export",
          format: "xlsx",
          reason: "xlsx_text_heavy_limit"
        })
      })
    );

    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockResolvedValue([{ contract_title: "MSA" }]);
    enforceFeatureAccess.mockResolvedValue({
      billingSnapshot: {
        organizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        trialEndsAt: null,
        currentPeriodEnd: null
      },
      accessResult: {
        allowed: true,
        feature: "exports",
        reason: "allowed",
        message: "Allowed"
      }
    });
    assertCanAccessIntelligenceSurface.mockResolvedValue({});
    assertCanUseShippedAction.mockImplementation(async (context: { role: string } | null) => {
      if (!context) {
        throw new ActiveOrganizationRequiredError();
      }
      return context;
    });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert: vi.fn().mockResolvedValue({ error: null })
      }))
    });

    const { GET: getCsv } = await import("@/app/dashboard/contracts/export/csv/route");
    const csvResponse = await getCsv(
      makeRequest("/dashboard/contracts/export/csv?preset=notes_and_decisions_export")
    );

    expect(csvResponse.status).toBe(200);
    expect(getExportRows).toHaveBeenCalledWith("org-1", "notes_and_decisions_export");
  });

  it("persists completion only after artifact generation succeeds", async () => {
    vi.resetModules();
    const actualExport = await vi.importActual<typeof import("@/lib/contracts/export")>(
      "@/lib/contracts/export"
    );
    const serializeExportArtifact = vi.fn(() => "contract_title\nMSA");
    vi.doMock("@/lib/contracts/export", () => ({
      ...actualExport,
      serializeExportArtifact
    }));

    const insert = vi.fn().mockResolvedValue({ error: null });
    createAdminSupabaseClient.mockReturnValue({
      from: vi.fn(() => ({
        insert
      }))
    });
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockResolvedValue([{ contract_title: "MSA" }]);

    const { GET } = await import("@/app/dashboard/contracts/export/csv/route");
    const response = await GET(
      makeRequest("/dashboard/contracts/export/csv?preset=workflow_export")
    );

    expect(response.status).toBe(200);
    expect(serializeExportArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        format: "csv",
        rows: [{ contract_title: "MSA" }]
      })
    );
    expect(insert).toHaveBeenCalled();
    const serializerOrder = serializeExportArtifact.mock.invocationCallOrder[0]!;
    expect(serializerOrder).toBeLessThan(insert.mock.invocationCallOrder[0]!);

    const attemptedIndex = createAuditLog.mock.calls.findIndex(
      ([input]) => input.action === "contracts.export_attempted"
    );
    const completedIndex = createAuditLog.mock.calls.findIndex(
      ([input]) => input.action === "contracts.exported"
    );
    expect(attemptedIndex).toBeGreaterThanOrEqual(0);
    expect(completedIndex).toBeGreaterThanOrEqual(0);
    expect(createAuditLog.mock.invocationCallOrder[attemptedIndex]!).toBeLessThan(
      serializerOrder
    );
    expect(createAuditLog.mock.invocationCallOrder[completedIndex]!).toBeGreaterThan(
      serializerOrder
    );
    expect(trackServerAnalyticsEvent.mock.invocationCallOrder[0]!).toBeGreaterThan(
      serializerOrder
    );

    vi.doUnmock("@/lib/contracts/export");
    vi.resetModules();
  });

  it("does not persist completion or exported audit when artifact generation fails", async () => {
    vi.resetModules();
    const actualExport = await vi.importActual<typeof import("@/lib/contracts/export")>(
      "@/lib/contracts/export"
    );
    const serializeExportArtifact = vi.fn(() => {
      throw new Error("SENSITIVE_NOTE_TEXT raw contract text should not leak");
    });
    vi.doMock("@/lib/contracts/export", () => ({
      ...actualExport,
      serializeExportArtifact
    }));

    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    getExportRows.mockResolvedValue([{ contract_title: "MSA" }]);

    const { GET } = await import("@/app/dashboard/contracts/export/xlsx/route");
    const response = await GET(
      makeRequest("/dashboard/contracts/export/xlsx?preset=workflow_export")
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual(
      expect.objectContaining({
        code: "ERR_EXPORT_FAILED_001",
        requestId: expect.any(String)
      })
    );
    expect(createAdminSupabaseClient).not.toHaveBeenCalled();
    expect(trackServerAnalyticsEvent).not.toHaveBeenCalled();
    expect(
      createAuditLog.mock.calls.some(([input]) => input.action === "contracts.exported")
    ).toBe(false);
    expect(
      createAuditLog.mock.calls.some(([input]) => input.action === "contracts.export_attempted")
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("SENSITIVE_NOTE_TEXT");
    expect(JSON.stringify(logServerError.mock.calls)).not.toContain("SENSITIVE_NOTE_TEXT");
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain("SENSITIVE_NOTE_TEXT");
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_sync_failed",
        severity: "P2",
        alert: true,
        metadata: expect.objectContaining({
          export_preset: "workflow_export",
          format: "xlsx"
        })
      })
    );
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          name: "Error",
          message: "[REDACTED]"
        })
      })
    );

    vi.doUnmock("@/lib/contracts/export");
    vi.resetModules();
  });
});
