import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const getBackgroundExportRows = vi.fn();
const createAuditLog = vi.fn();
const emitOperationalEvent = vi.fn();
const logServerError = vi.fn();
const logServerWarn = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getBackgroundExportRows
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

vi.mock("@/lib/observability/server-logger", () => ({
  logServerError,
  logServerWarn
}));

const queuedExport = {
  id: "export-request-1",
  organization_id: "org-1",
  actor_user_id: "user-1",
  export_scope: "contracts",
  format: "csv",
  status: "queued",
  requested_at: "2026-06-02T10:00:00.000Z",
  completed_at: null,
  evidence_json: {
    export_preset: "workflow_export",
    format: "csv",
    background_export: true,
    included_sections: ["contract_register", "workflow"],
    sensitive_sections_included: false
  }
};

function makeListQuery(data: unknown[]) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn().mockResolvedValue({ data, error: null })
  };
  return chain;
}

function makeClaimQuery(data: unknown) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    select: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null })
  };
  return chain;
}

function makeUpdateQuery(capture: (value: unknown) => void) {
  const chain = {
    update: vi.fn((value: unknown) => {
      capture(value);
      return chain;
    }),
    eq: vi.fn().mockResolvedValue({ data: null, error: null })
  };
  return chain;
}

describe("background contract exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAuditLog.mockResolvedValue({ ok: true });
    emitOperationalEvent.mockResolvedValue({});
  });

  it("moves queued exports through processing to completed with safe metadata only", async () => {
    const writes: unknown[] = [];
    const claimed = {
      ...queuedExport,
      status: "processing",
      evidence_json: {
        ...queuedExport.evidence_json,
        status: "processing",
        processing_started_at: "2026-06-02T10:01:00.000Z"
      }
    };
    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeListQuery([queuedExport]))
        .mockReturnValueOnce(makeClaimQuery(claimed))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);
    getBackgroundExportRows.mockResolvedValue([
      {
        contract_title: "=formula is sanitized by export serialization",
        cycle_status: "open"
      }
    ]);

    const { processQueuedContractExportRequests } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await processQueuedContractExportRequests({ limit: 1 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        claimed: 1,
        completed: 1,
        failed: 0
      })
    );
    expect(getBackgroundExportRows).toHaveBeenCalledWith(
      "org-1",
      "workflow_export",
      expect.objectContaining({ client: expect.anything() })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "completed",
        completed_at: expect.any(String),
        evidence_json: expect.objectContaining({
          export_preset: "workflow_export",
          status: "completed",
          row_count: 1,
          artifact_storage: "deferred",
          download_available: false,
          artifact_size_bytes: expect.any(Number)
        })
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_background_completed",
        entityId: "export-request-1",
        details: expect.objectContaining({
          export_preset: "workflow_export",
          row_count: 1,
          download_available: false
        })
      })
    );
  });

  it("marks processing failures failed and emits safe monitoring metadata", async () => {
    const writes: unknown[] = [];
    const claimed = {
      ...queuedExport,
      status: "processing",
      evidence_json: {
        ...queuedExport.evidence_json,
        status: "processing",
        processing_started_at: "2026-06-02T10:01:00.000Z"
      }
    };
    const admin = {
      from: vi
        .fn()
        .mockReturnValueOnce(makeListQuery([queuedExport]))
        .mockReturnValueOnce(makeClaimQuery(claimed))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);
    getBackgroundExportRows.mockRejectedValue(
      new Error("raw contract text and full note must not be exposed")
    );

    const { processQueuedContractExportRequests } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await processQueuedContractExportRequests({ limit: 1 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        completed: 0,
        failed: 1
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "failed",
        evidence_json: expect.objectContaining({
          export_preset: "workflow_export",
          status: "failed",
          failure_code: "ERR_EXPORT_BACKGROUND_FAILED_001",
          failure_category: "background_export_processing_failed"
        })
      })
    );
    expect(JSON.stringify(writes)).not.toContain("raw contract text");
    expect(JSON.stringify(writes)).not.toContain("full note");
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_failed",
        severity: "P2",
        alert: true,
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          failure_code: "ERR_EXPORT_BACKGROUND_FAILED_001"
        })
      })
    );
  });
});
