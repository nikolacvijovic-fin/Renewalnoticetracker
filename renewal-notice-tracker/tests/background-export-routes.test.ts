import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeActiveOrganizationContext } from "./factories/domain";

const getOrganizationContextOrNull = vi.fn();
const assertCanUseShippedAction = vi.fn();
const assertContractExportPresetAccess = vi.fn();
const createBackgroundContractExportRequest = vi.fn();
const getBackgroundContractExportRequestStatus = vi.fn();
const processQueuedContractExportRequests = vi.fn();
const hasValidInternalRouteSecret = vi.fn();

vi.mock("@/lib/auth", () => ({
  getOrganizationContextOrNull,
  assertCanUseShippedAction,
  ActiveOrganizationRequiredError: class ActiveOrganizationRequiredError extends Error {},
  OrganizationAuthorizationError: class OrganizationAuthorizationError extends Error {
    constructor() {
      super("forbidden");
    }
  }
}));

vi.mock("@/lib/contracts/export-access", () => ({
  assertContractExportPresetAccess
}));

vi.mock("@/lib/contracts/background-exports", () => ({
  createBackgroundContractExportRequest,
  getBackgroundContractExportRequestStatus,
  processQueuedContractExportRequests
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock("@/lib/internal-route-auth", () => ({
  hasValidInternalRouteSecret,
  hasValidDestructiveInternalRequestAuth: vi.fn()
}));

vi.mock("@/lib/observability/server-logger", () => ({
  logServerError: vi.fn(),
  logServerWarn: vi.fn()
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent: vi.fn()
}));

function makeJsonRequest(path: string, body?: unknown, headers?: HeadersInit) {
  return new Request(`http://localhost:3000${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("background export routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue(
      makeActiveOrganizationContext({
        user: { id: "operator-1" },
        role: "operator"
      })
    );
    assertCanUseShippedAction.mockImplementation(async (context) => context);
    assertContractExportPresetAccess.mockResolvedValue(undefined);
    createBackgroundContractExportRequest.mockResolvedValue({
      id: "export-request-1",
      status: "queued",
      preset: "workflow_export",
      format: "csv",
      requestedAt: "2026-06-02T10:00:00.000Z",
      downloadAvailable: false
    });
    getBackgroundContractExportRequestStatus.mockResolvedValue({
      id: "export-request-1",
      status: "queued",
      preset: "workflow_export",
      format: "csv",
      rowCount: 0,
      downloadAvailable: false
    });
    processQueuedContractExportRequests.mockResolvedValue({
      ok: true,
      requestedLimit: 2,
      claimed: 1,
      completed: 1,
      failed: 0,
      skipped: 0
    });
    hasValidInternalRouteSecret.mockImplementation((request: Request) => {
      return request.headers.get("x-internal-operations-secret") === "operations-secret";
    });
  });

  it("creates a queued background export after shipped action and preset access checks", async () => {
    const { POST } = await import("@/app/api/exports/contracts/route");
    const response = await POST(
      makeJsonRequest("/api/exports/contracts", {
        preset: "workflow_export",
        format: "csv"
      })
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual(
      expect.objectContaining({
        id: "export-request-1",
        status: "queued",
        preset: "workflow_export",
        format: "csv",
        downloadAvailable: false
      })
    );
    expect(assertCanUseShippedAction).toHaveBeenCalled();
    expect(assertContractExportPresetAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: expect.objectContaining({ id: "workflow_export" }),
        format: "csv",
        source: "background_export_request"
      })
    );
    expect(createBackgroundContractExportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        presetId: "workflow_export",
        format: "csv"
      })
    );
  });

  it("does not create a request when preset access is denied", async () => {
    const { OrganizationAuthorizationError } = await import("@/lib/auth");
    assertContractExportPresetAccess.mockRejectedValueOnce(
      new OrganizationAuthorizationError("export_contracts", "owner")
    );

    const { POST } = await import("@/app/api/exports/contracts/route");
    const response = await POST(
      makeJsonRequest("/api/exports/contracts", {
        preset: "notes_and_decisions_export",
        format: "xlsx"
      })
    );

    expect(response.status).toBe(403);
    expect(createBackgroundContractExportRequest).not.toHaveBeenCalled();
  });

  it("returns only org-scoped background export status", async () => {
    const { GET } = await import("@/app/api/exports/contracts/[id]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/exports/contracts/export-request-1"),
      { params: { id: "export-request-1" } }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ id: "export-request-1" }));
    expect(getBackgroundContractExportRequestStatus).toHaveBeenCalledWith({
      organizationId: "org-1",
      requestId: "export-request-1"
    });
  });

  it("uses a generic not-found response for cross-tenant or missing status lookups", async () => {
    getBackgroundContractExportRequestStatus.mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/exports/contracts/[id]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/exports/contracts/other-org-request"),
      { params: { id: "other-org-request" } }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Export request was not found.",
        code: "ERR_EXPORT_REQUEST_NOT_FOUND_001"
      })
    );
  });

  it("rejects internal export processing without the operations secret", async () => {
    const { POST } = await import("@/app/api/internal/export-jobs/route");
    const response = await POST(makeJsonRequest("/api/internal/export-jobs", { limit: 2 }));

    expect(response.status).toBe(401);
    expect(processQueuedContractExportRequests).not.toHaveBeenCalled();
  });

  it("processes a bounded number of queued exports with the operations secret", async () => {
    const { POST } = await import("@/app/api/internal/export-jobs/route");
    const response = await POST(
      makeJsonRequest(
        "/api/internal/export-jobs",
        { limit: 20 },
        { "x-internal-operations-secret": "operations-secret" }
      )
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(processQueuedContractExportRequests).toHaveBeenCalledWith({ limit: 10 });
    expect(body).toEqual(
      expect.objectContaining({
        ok: true,
        completed: 1,
        failed: 0
      })
    );
  });
});
