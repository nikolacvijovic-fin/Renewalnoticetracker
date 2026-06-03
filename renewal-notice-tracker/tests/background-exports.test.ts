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

function makeStorageMock(overrides?: {
  upload?: ReturnType<typeof vi.fn>;
  download?: ReturnType<typeof vi.fn>;
  remove?: ReturnType<typeof vi.fn>;
}) {
  return {
    from: vi.fn(() => ({
      upload: overrides?.upload ?? vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null }),
      download: overrides?.download ?? vi.fn(),
      remove: overrides?.remove ?? vi.fn().mockResolvedValue({ data: [], error: null })
    }))
  };
}

describe("background contract exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAuditLog.mockResolvedValue({ ok: true });
    emitOperationalEvent.mockResolvedValue({});
  });

  it("stores generated artifacts before marking exports completed", async () => {
    const writes: unknown[] = [];
    const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
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
      storage: makeStorageMock({ upload }),
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
          artifact_storage: "stored",
          download_available: true,
          artifact_size_bytes: expect.any(Number),
          storage_bucket: "export-artifacts",
          storage_object_path: expect.stringContaining("org-1/contract-exports/export-request-1/"),
          checksum_sha256: expect.any(String),
          content_type: "text/csv; charset=utf-8",
          file_extension: "csv",
          filename: "contracts-workflow_export-export-request-1.csv",
          expires_at: expect.any(String)
        })
      })
    );
    expect(upload).toHaveBeenCalledWith(
      expect.stringContaining("org-1/contract-exports/export-request-1/"),
      expect.any(String),
      expect.objectContaining({
        contentType: "text/csv; charset=utf-8",
        upsert: false
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_background_completed",
        entityId: "export-request-1",
        details: expect.objectContaining({
          export_preset: "workflow_export",
          row_count: 1,
          download_available: true,
          artifact_storage: "stored"
        })
      })
    );
  });

  it("marks storage failures failed and emits safe monitoring metadata", async () => {
    const writes: unknown[] = [];
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("SENSITIVE_EXPORT_PAYLOAD_MARKER")
    });
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
      storage: makeStorageMock({ upload }),
      from: vi
        .fn()
        .mockReturnValueOnce(makeListQuery([queuedExport]))
        .mockReturnValueOnce(makeClaimQuery(claimed))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);
    getBackgroundExportRows.mockResolvedValue([{ contract_title: "MSA" }]);

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
          artifact_storage: "failed",
          failure_code: "ERR_EXPORT_BACKGROUND_STORAGE_FAILED_001",
          failure_category: "background_export_storage_failed"
        })
      })
    );
    expect(JSON.stringify(writes)).not.toContain("SENSITIVE_EXPORT_PAYLOAD_MARKER");
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_failed",
        severity: "P2",
        alert: true,
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          failure_code: "ERR_EXPORT_BACKGROUND_STORAGE_FAILED_001"
        })
      })
    );
  });

  it("returns downloadable artifact bytes without exposing storage paths", async () => {
    const download = vi.fn().mockResolvedValue({
      data: Buffer.from("contract_title\nMSA"),
      error: null
    });
    const admin = {
      storage: makeStorageMock({ download }),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: {
            ...queuedExport,
            status: "completed",
            completed_at: "2026-06-02T10:05:00.000Z",
            evidence_json: {
              ...queuedExport.evidence_json,
              status: "completed",
              artifact_storage: "stored",
              download_available: true,
              storage_bucket: "export-artifacts",
              storage_object_path: "org-1/contract-exports/export-request-1/private.csv",
              filename: "contracts-workflow_export-export-request-1.csv",
              content_type: "text/csv; charset=utf-8",
              artifact_size_bytes: 18,
              expires_at: "2099-01-01T00:00:00.000Z"
            }
          },
          error: null
        })
      }))
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { downloadBackgroundContractExportArtifact } = await import(
      "@/lib/contracts/background-exports"
    );
    const artifact = await downloadBackgroundContractExportArtifact({
      organizationId: "org-1",
      actorUserId: "user-1",
      requestId: "export-request-1"
    });

    expect(artifact).toEqual(
      expect.objectContaining({
        filename: "contracts-workflow_export-export-request-1.csv",
        contentType: "text/csv; charset=utf-8",
        artifactSizeBytes: 18
      })
    );
    expect(artifact.body.toString("utf8")).toContain("MSA");
    expect(JSON.stringify(artifact)).not.toContain("storage_object_path");
    expect(JSON.stringify(artifact)).not.toContain("private.csv");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_background_downloaded",
        details: expect.not.objectContaining({
          storage_object_path: expect.anything()
        })
      })
    );
  });

  it("cleans up expired artifacts and marks requests expired", async () => {
    const writes: unknown[] = [];
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const expiredExport = {
      ...queuedExport,
      status: "completed",
      completed_at: "2026-06-02T10:05:00.000Z",
      evidence_json: {
        ...queuedExport.evidence_json,
        status: "completed",
        artifact_storage: "stored",
        storage_bucket: "export-artifacts",
        storage_object_path: "org-1/contract-exports/export-request-1/private.csv",
        expires_at: "2000-01-01T00:00:00.000Z",
        artifact_size_bytes: 18
      }
    };
    const admin = {
      storage: makeStorageMock({ remove }),
      from: vi
        .fn()
        .mockReturnValueOnce(makeListQuery([expiredExport]))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { cleanupExpiredBackgroundExportArtifacts } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await cleanupExpiredBackgroundExportArtifacts({ limit: 1 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        expired: 1,
        deleted: 1,
        failed: 0
      })
    );
    expect(remove).toHaveBeenCalledWith([
      "org-1/contract-exports/export-request-1/private.csv"
    ]);
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "expired",
        evidence_json: expect.objectContaining({
          status: "expired",
          artifact_storage: "expired",
          download_available: false
        })
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.export_background_expired",
        entityId: "export-request-1"
      })
    );
  });
});
