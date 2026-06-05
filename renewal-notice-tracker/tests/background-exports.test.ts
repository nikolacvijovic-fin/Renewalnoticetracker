import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const iterateExportRows = vi.fn();
const createAuditLog = vi.fn();
const emitOperationalEvent = vi.fn();
const logServerError = vi.fn();
const logServerWarn = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  iterateExportRows
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
  const result = { data: null, error: null };
  const chain = {
    update: vi.fn((value: unknown) => {
      capture(value);
      return chain;
    }),
    eq: vi.fn(() => chain),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result))
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

function mockExportPages(pages: unknown[][], input?: { totalRowCount?: number; pageSize?: number }) {
  iterateExportRows.mockImplementation(async function* () {
    const pageSize = input?.pageSize ?? 1000;
    const totalRowCount = input?.totalRowCount ?? pages.reduce((sum, page) => sum + page.length, 0);
    for (const [pageIndex, rows] of pages.entries()) {
      yield {
        rows,
        pageIndex,
        pageSize,
        rowOffset: pageIndex * pageSize,
        totalRowCount
      };
    }
  });
}

describe("background contract exports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAuditLog.mockResolvedValue({ ok: true });
    emitOperationalEvent.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("records a safe operational event when a background export is requested", async () => {
    const admin = {
      from: vi.fn(() => ({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({
              data: queuedExport,
              error: null
            })
          }))
        }))
      }))
    };
    createAdminSupabaseClient.mockReturnValue(admin);

    const { createBackgroundContractExportRequest } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await createBackgroundContractExportRequest({
      context: {
        organizationId: "org-1",
        user: { id: "user-1", email: "owner@example.com" },
        membership: { role: "admin" },
        organization: { id: "org-1", name: "Org" }
      } as never,
      presetId: "workflow_export",
      format: "csv"
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: "export-request-1",
        status: "queued"
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_requested",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
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
    mockExportPages([
      [
        {
          contract_title: "=formula is sanitized by export serialization",
          cycle_status: "open"
        }
      ]
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
    expect(iterateExportRows).toHaveBeenCalledWith(
      "org-1",
      "workflow_export",
      expect.objectContaining({
        client: expect.anything(),
        maxRows: 25000,
        pageSize: 1000
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "completed",
        completed_at: expect.any(String),
        evidence_json: expect.objectContaining({
          export_preset: "workflow_export",
          status: "completed",
          row_count: 1,
          page_size: 1000,
          page_count: 1,
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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_claimed",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_completed",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          row_count: 1,
          page_size: 1000,
          page_count: 1
        })
      })
    );
  }, 10_000);

  it("uses operational config for background export page size and default job limit", async () => {
    vi.resetModules();
    vi.stubEnv("BACKGROUND_EXPORT_PAGE_SIZE", "250");
    vi.stubEnv("BACKGROUND_EXPORT_JOB_LIMIT", "4");

    const writes: unknown[] = [];
    const listQuery = makeListQuery([queuedExport]);
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
        .mockReturnValueOnce(listQuery)
        .mockReturnValueOnce(makeClaimQuery(claimed))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);
    mockExportPages([[{ contract_title: "Config driven export" }]], {
      pageSize: 250
    });

    const { processQueuedContractExportRequests } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await processQueuedContractExportRequests();

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        requestedLimit: 4,
        completed: 1
      })
    );
    expect(listQuery.limit).toHaveBeenCalledWith(4);
    expect(iterateExportRows).toHaveBeenCalledWith(
      "org-1",
      "workflow_export",
      expect.objectContaining({
        client: expect.anything(),
        maxRows: 25000,
        pageSize: 250
      })
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "completed",
        evidence_json: expect.objectContaining({
          page_size: 250,
          page_count: 1
        })
      })
    );
  }, 10_000);

  it("assembles background CSV from pages with safe chunk metadata", async () => {
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
    mockExportPages(
      [
        [{ contract_title: "=formula from page one", cycle_status: "open" }],
        [{ contract_title: "MSA page two", cycle_status: "closed" }]
      ],
      { totalRowCount: 6000 }
    );

    const { processQueuedContractExportRequests } = await import(
      "@/lib/contracts/background-exports"
    );
    const result = await processQueuedContractExportRequests({ limit: 1 });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        completed: 1,
        failed: 0
      })
    );
    expect(upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining("'=formula from page one"),
      expect.any(Object)
    );
    expect(upload.mock.calls[0]?.[1]).toContain("MSA page two");
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "completed",
        evidence_json: expect.objectContaining({
          row_count: 2,
          page_size: 1000,
          page_count: 2,
          artifact_storage: "stored"
        })
      })
    );
  }, 10_000);

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
    mockExportPages([[{ contract_title: "MSA" }]]);

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
    expect(JSON.stringify(logServerError.mock.calls)).not.toContain(
      "SENSITIVE_EXPORT_PAYLOAD_MARKER"
    );
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain(
      "SENSITIVE_EXPORT_PAYLOAD_MARKER"
    );
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          name: "ExportArtifactStorageError",
          message: "[REDACTED]"
        })
      })
    );
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
  }, 10_000);

  it("fails background CSV safely when chunked artifact size exceeds the limit", async () => {
    const { EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES } = await import("@/lib/contracts/export");
    const realByteLength = Buffer.byteLength;
    const byteLengthSpy = vi.spyOn(Buffer, "byteLength").mockImplementation((value, encoding) => {
      if (String(value).includes("ARTIFACT_TOO_LARGE_MARKER")) {
        return EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES + 1;
      }
      return realByteLength(value as never, encoding as never);
    });
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
    mockExportPages([[{ contract_title: "ARTIFACT_TOO_LARGE_MARKER" }]]);

    try {
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
      expect(upload).not.toHaveBeenCalled();
      expect(writes).toContainEqual(
        expect.objectContaining({
          status: "failed",
          evidence_json: expect.objectContaining({
            failure_code: "ERR_EXPORT_BACKGROUND_ARTIFACT_TOO_LARGE_001",
            failure_category: "background_export_artifact_too_large",
            row_count: 1,
            page_size: 1000,
            page_count: 1,
            max_artifact_size_bytes: EXPORT_BACKGROUND_ARTIFACT_MAX_BYTES
          })
        })
      );
    } finally {
      byteLengthSpy.mockRestore();
    }
  }, 10_000);

  it("fails oversized rich XLSX exports during preflight with safe evidence", async () => {
    const { EXPORT_BACKGROUND_XLSX_ROW_LIMIT } = await import("@/lib/contracts/export");
    const writes: unknown[] = [];
    const upload = vi.fn().mockResolvedValue({ data: { path: "stored" }, error: null });
    const richQueuedExport = {
      ...queuedExport,
      format: "xlsx",
      evidence_json: {
        ...queuedExport.evidence_json,
        export_preset: "notes_and_decisions_export",
        format: "xlsx",
        included_sections: ["contract_register", "workflow", "reminders", "decisions", "notes"],
        sensitive_sections_included: true
      }
    };
    const claimed = {
      ...richQueuedExport,
      status: "processing",
      evidence_json: {
        ...richQueuedExport.evidence_json,
        status: "processing",
        processing_started_at: "2026-06-02T10:01:00.000Z"
      }
    };
    const admin = {
      storage: makeStorageMock({ upload }),
      from: vi
        .fn()
        .mockReturnValueOnce(makeListQuery([richQueuedExport]))
        .mockReturnValueOnce(makeClaimQuery(claimed))
        .mockReturnValueOnce(makeUpdateQuery((value) => writes.push(value)))
    };
    createAdminSupabaseClient.mockReturnValue(admin);
    mockExportPages(
      [[{ contract_title: "first-page-row" }]],
      { totalRowCount: EXPORT_BACKGROUND_XLSX_ROW_LIMIT + 1 }
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
    expect(upload).not.toHaveBeenCalled();
    expect(writes).toContainEqual(
      expect.objectContaining({
        status: "failed",
        evidence_json: expect.objectContaining({
          export_preset: "notes_and_decisions_export",
          format: "xlsx",
          status: "failed",
          failure_code: "ERR_EXPORT_BACKGROUND_XLSX_TOO_LARGE_001",
          failure_category: "background_export_xlsx_preflight_rejected",
          preflight_reason: "xlsx_background_row_limit",
          page_size: undefined,
          page_count: undefined,
          max_background_xlsx_rows: EXPORT_BACKGROUND_XLSX_ROW_LIMIT,
          max_text_heavy_rows: undefined,
          max_complexity_score: undefined,
          recommendation: "use_csv_or_reduce_scope"
        })
      })
    );
    expect(JSON.stringify(writes)).not.toContain("SENSITIVE_NOTE_MARKER");
    expect(JSON.stringify(logServerError.mock.calls)).not.toContain("SENSITIVE_NOTE_MARKER");
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain("SENSITIVE_NOTE_MARKER");
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_failed",
        severity: "P2",
        sensitivity: "customer_sensitive",
        metadata: expect.objectContaining({
          export_preset: "notes_and_decisions_export",
          format: "xlsx",
          failure_code: "ERR_EXPORT_BACKGROUND_XLSX_TOO_LARGE_001"
        })
      })
    );
  }, 10_000);

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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_downloaded",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          format: "csv",
          artifact_size_bytes: 18
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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "export_background_expired",
        organizationId: "org-1",
        actorUserId: "user-1",
        metadata: expect.objectContaining({
          export_request_id: "export-request-1",
          export_preset: "workflow_export",
          format: "csv"
        })
      })
    );
  });
});
