import { createAuditLog } from "@/lib/audit";
import type { ActiveOrganizationContext } from "@/lib/auth";
import { createHash } from "node:crypto";
import { getAppConfig } from "@/lib/config";
import {
  ExportScaleLimitError,
  resolveExportPreset,
  toCsv,
  toXlsxBuffer,
  type ExportFormat,
  type ExportPresetId
} from "@/lib/contracts/export";
import { getBackgroundExportRows } from "@/lib/contracts/kernel-queries";
import { buildExportRequestEvidence } from "@/lib/commercial/privacy-operations";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { logServerError, logServerWarn } from "@/lib/observability/server-logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";

export const BACKGROUND_EXPORT_ARTIFACT_RETENTION_DAYS = 7;

export const BACKGROUND_EXPORT_STATUSES = [
  "queued",
  "processing",
  "completed",
  "failed",
  "expired",
  "cancelled"
] as const;

export type BackgroundExportStatus = (typeof BACKGROUND_EXPORT_STATUSES)[number];

type DataExportRequestRow = Database["public"]["Tables"]["data_export_requests"]["Row"];
type EvidenceRecord = Record<string, unknown>;

export class BackgroundExportDownloadError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 404
  ) {
    super(message);
    this.name = "BackgroundExportDownloadError";
  }
}

class ExportArtifactStorageError extends Error {
  constructor(public readonly cause: unknown) {
    super("Background export artifact storage failed.");
    this.name = "ExportArtifactStorageError";
  }
}

function asEvidence(value: Json | null | undefined): EvidenceRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as EvidenceRecord) }
    : {};
}

function getExportArtifactContentType(format: ExportFormat) {
  return format === "csv"
    ? "text/csv; charset=utf-8"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function getExportArtifactExtension(format: ExportFormat) {
  return format === "csv" ? "csv" : "xlsx";
}

function getSafeExportFilename(input: {
  requestId: string;
  presetId: ExportPresetId;
  format: ExportFormat;
}) {
  return `contracts-${input.presetId}-${input.requestId}.${getExportArtifactExtension(input.format)}`;
}

function getExportArtifactPath(input: {
  organizationId: string;
  requestId: string;
  filename: string;
}) {
  return `${input.organizationId}/contract-exports/${input.requestId}/${input.filename}`;
}

function getExportArtifactExpiresAt(now = new Date()) {
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + BACKGROUND_EXPORT_ARTIFACT_RETENTION_DAYS);
  return expiresAt.toISOString();
}

function hashArtifact(artifact: string | Buffer) {
  return createHash("sha256").update(artifact).digest("hex");
}

async function artifactDownloadDataToBuffer(data: unknown) {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (typeof data === "string") {
    return Buffer.from(data, "utf8");
  }

  if (
    data &&
    typeof data === "object" &&
    "arrayBuffer" in data &&
    typeof (data as { arrayBuffer?: unknown }).arrayBuffer === "function"
  ) {
    return Buffer.from(await (data as Blob).arrayBuffer());
  }

  if (
    data &&
    typeof data === "object" &&
    "text" in data &&
    typeof (data as { text?: unknown }).text === "function"
  ) {
    return Buffer.from(await (data as { text: () => Promise<string> }).text(), "utf8");
  }

  throw new BackgroundExportDownloadError(
    "Export artifact could not be downloaded.",
    "ERR_EXPORT_ARTIFACT_DOWNLOAD_FAILED_001",
    500
  );
}

function getBackgroundExportEvidence(input: {
  presetId: ExportPresetId;
  format: ExportFormat;
  source: "background_export_request" | "background_export_processor";
  status: BackgroundExportStatus;
  rowCount?: number;
  artifactSizeBytes?: number;
  artifactStorageStatus?: "pending" | "stored" | "failed" | "deleted" | "expired";
  storageBucket?: string;
  storageObjectPath?: string;
  checksumSha256?: string;
  contentType?: string;
  fileExtension?: string;
  filename?: string;
  expiresAt?: string;
  downloadAvailable?: boolean;
  failureCode?: string;
  failureCategory?: string;
  requestedAt?: string;
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
}) {
  const preset = resolveExportPreset(input.presetId);
  const exportTimestamps =
    input.status === "completed" && input.completedAt
      ? { exported_at: input.completedAt }
      : {};

  return {
    ...(buildExportRequestEvidence({
      format: input.format,
      rowCount: input.rowCount ?? 0,
      source: input.source
    }) as EvidenceRecord),
    export_preset: preset.id,
    format: input.format,
    row_count: input.rowCount ?? 0,
    included_sections: preset.includedSections,
    sensitive_sections_included: preset.sensitiveSectionsIncluded,
    ...exportTimestamps,
    background_export: true,
    status: input.status,
    artifact_storage: input.artifactStorageStatus ?? "pending",
    storage_bucket: input.storageBucket,
    storage_object_path: input.storageObjectPath,
    checksum_sha256: input.checksumSha256,
    content_type: input.contentType,
    file_extension: input.fileExtension,
    filename: input.filename,
    expires_at: input.expiresAt,
    download_available: input.downloadAvailable ?? false,
    requested_at: input.requestedAt,
    processing_started_at: input.processingStartedAt,
    completed_at: input.completedAt,
    failed_at: input.failedAt,
    artifact_size_bytes: input.artifactSizeBytes,
    failure_code: input.failureCode,
    failure_category: input.failureCategory
  };
}

function getFailureEvidence(error: unknown) {
  if (error instanceof ExportArtifactStorageError) {
    return {
      failureCode: "ERR_EXPORT_BACKGROUND_STORAGE_FAILED_001",
      failureCategory: "background_export_storage_failed"
    };
  }

  if (error instanceof ExportScaleLimitError) {
    return {
      failureCode: "ERR_EXPORT_BACKGROUND_ROW_LIMIT_001",
      failureCategory: "background_export_row_limit",
      maxRows: error.input.maxRows,
      rowCount: error.input.rowCount
    };
  }

  return {
    failureCode: "ERR_EXPORT_BACKGROUND_FAILED_001",
    failureCategory: "background_export_processing_failed"
  };
}

function isExpired(expiresAt: unknown, now = new Date()) {
  return typeof expiresAt === "string" && new Date(expiresAt).getTime() <= now.getTime();
}

function isStoredCompletedExport(row: DataExportRequestRow, evidence: EvidenceRecord) {
  return row.status === "completed" &&
    evidence.artifact_storage === "stored" &&
    typeof evidence.storage_bucket === "string" &&
    typeof evidence.storage_object_path === "string" &&
    !isExpired(evidence.expires_at);
}

export function toBackgroundExportStatusResponse(row: DataExportRequestRow) {
  const evidence = asEvidence(row.evidence_json);
  const downloadAvailable = isStoredCompletedExport(row, evidence);
  return {
    id: row.id,
    status: row.status as BackgroundExportStatus,
    preset: evidence.export_preset ?? null,
    format: row.format,
    rowCount: evidence.row_count ?? 0,
    includedSections: evidence.included_sections ?? [],
    sensitiveSectionsIncluded: Boolean(evidence.sensitive_sections_included),
    requestedAt: row.requested_at,
    processingStartedAt: evidence.processing_started_at ?? null,
    completedAt: row.completed_at ?? evidence.completed_at ?? null,
    failedAt: evidence.failed_at ?? null,
    failureCode: evidence.failure_code ?? null,
    failureCategory: evidence.failure_category ?? null,
    downloadAvailable,
    expiresAt: evidence.expires_at ?? null,
    artifactSizeBytes: evidence.artifact_size_bytes ?? null,
    filename: evidence.filename ?? null,
    contentType: evidence.content_type ?? null,
    artifactStorage: evidence.artifact_storage ?? "pending"
  };
}

export async function createBackgroundContractExportRequest(input: {
  context: ActiveOrganizationContext;
  presetId: ExportPresetId;
  format: ExportFormat;
}) {
  const admin = createAdminSupabaseClient();
  const requestedAt = new Date().toISOString();
  const evidence = getBackgroundExportEvidence({
    presetId: input.presetId,
    format: input.format,
    source: "background_export_request",
    status: "queued",
    requestedAt
  });

  const result = await checkedPrivilegedWrite(
    admin
      .from("data_export_requests")
      .insert({
        organization_id: input.context.organizationId,
        actor_user_id: input.context.user.id,
        export_scope: "contracts",
        format: input.format,
        status: "queued",
        requested_at: requestedAt,
        evidence_json: evidence as Json
      })
      .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
      .single(),
    {
      operation: "insert",
      table: "data_export_requests",
      context: "background_contract_export_request"
    }
  );

  if (!result.data) {
    throw new Error("Background export request insert did not return a row.");
  }
  const row = result.data as DataExportRequestRow;
  await createAuditLog({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    action: "contracts.export_background_requested",
    entityType: "export",
    entityId: row.id,
    details: evidence
  });

  return toBackgroundExportStatusResponse(row);
}

export async function getBackgroundContractExportRequestStatus(input: {
  organizationId: string;
  requestId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("data_export_requests")
    .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
    .eq("id", input.requestId)
    .eq("organization_id", input.organizationId)
    .eq("export_scope", "contracts")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toBackgroundExportStatusResponse(data as DataExportRequestRow);
}

async function claimQueuedExport(row: DataExportRequestRow) {
  const admin = createAdminSupabaseClient();
  const evidence = asEvidence(row.evidence_json);
  const processingStartedAt = new Date().toISOString();
  const result = await checkedPrivilegedWrite(
    admin
      .from("data_export_requests")
      .update({
        status: "processing",
        evidence_json: {
          ...evidence,
          status: "processing",
          processing_started_at: processingStartedAt
        } as Json
      })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
      .maybeSingle(),
    {
      operation: "update",
      table: "data_export_requests",
      context: "background_contract_export_claim"
    }
  );

  return result.data as DataExportRequestRow | null;
}

async function markExportCompleted(input: {
  row: DataExportRequestRow;
  presetId: ExportPresetId;
  format: ExportFormat;
  rowCount: number;
  artifactSizeBytes: number;
  storageBucket: string;
  storageObjectPath: string;
  checksumSha256: string;
  contentType: string;
  filename: string;
  expiresAt: string;
}) {
  const admin = createAdminSupabaseClient();
  const evidence = asEvidence(input.row.evidence_json);
  const completedAt = new Date().toISOString();
  const completedEvidence = {
    ...evidence,
    ...getBackgroundExportEvidence({
      presetId: input.presetId,
      format: input.format,
      source: "background_export_processor",
      status: "completed",
      rowCount: input.rowCount,
      artifactSizeBytes: input.artifactSizeBytes,
      artifactStorageStatus: "stored",
      storageBucket: input.storageBucket,
      storageObjectPath: input.storageObjectPath,
      checksumSha256: input.checksumSha256,
      contentType: input.contentType,
      fileExtension: getExportArtifactExtension(input.format),
      filename: input.filename,
      expiresAt: input.expiresAt,
      downloadAvailable: true,
      requestedAt: input.row.requested_at,
      processingStartedAt: evidence.processing_started_at as string | undefined,
      completedAt
    })
  };

  await checkedPrivilegedWrite(
    admin
      .from("data_export_requests")
      .update({
        status: "completed",
        completed_at: completedAt,
        evidence_json: completedEvidence as Json
      })
      .eq("id", input.row.id),
    {
      operation: "update",
      table: "data_export_requests",
      context: "background_contract_export_completed"
    }
  );

  await createAuditLog({
    organizationId: input.row.organization_id,
    actorUserId: input.row.actor_user_id,
    action: "contracts.export_background_completed",
    entityType: "export",
    entityId: input.row.id,
    details: completedEvidence
  });
}

async function markExportFailed(input: {
  row: DataExportRequestRow;
  presetId: ExportPresetId;
  format: ExportFormat;
  error: unknown;
}) {
  const admin = createAdminSupabaseClient();
  const evidence = asEvidence(input.row.evidence_json);
  const failedAt = new Date().toISOString();
  const failure = getFailureEvidence(input.error);
  const failedEvidence = {
    ...evidence,
    ...getBackgroundExportEvidence({
      presetId: input.presetId,
      format: input.format,
      source: "background_export_processor",
      status: "failed",
      rowCount: failure.rowCount,
      artifactStorageStatus:
        input.error instanceof ExportArtifactStorageError ? "failed" : "pending",
      failureCode: failure.failureCode,
      failureCategory: failure.failureCategory,
      requestedAt: input.row.requested_at,
      processingStartedAt: evidence.processing_started_at as string | undefined,
      failedAt
    }),
    max_rows: failure.maxRows
  };

  await checkedPrivilegedWrite(
    admin
      .from("data_export_requests")
      .update({
        status: "failed",
        evidence_json: failedEvidence as Json
      })
      .eq("id", input.row.id),
    {
      operation: "update",
      table: "data_export_requests",
      context: "background_contract_export_failed"
    }
  );

  await createAuditLog({
    organizationId: input.row.organization_id,
    actorUserId: input.row.actor_user_id,
    action: "contracts.export_background_failed",
    entityType: "export",
    entityId: input.row.id,
    details: failedEvidence
  });

  logServerError({
    event: "export_background_failed",
    organizationId: input.row.organization_id,
    actorUserId: input.row.actor_user_id,
    metadata: {
      export_request_id: input.row.id,
      export_preset: input.presetId,
      format: input.format,
      failure_code: failure.failureCode,
      failure_category: failure.failureCategory
    },
    error: input.error
  });
  await emitOperationalEvent({
    eventName: "export_background_failed",
    severity: "P2",
    sensitivity: resolveExportPreset(input.presetId).sensitiveSectionsIncluded
      ? "customer_sensitive"
      : "internal",
    alert: true,
    organizationId: input.row.organization_id,
    actorUserId: input.row.actor_user_id,
    metadata: {
      export_request_id: input.row.id,
      export_preset: input.presetId,
      format: input.format,
      failure_code: failure.failureCode,
      failure_category: failure.failureCategory
    },
    error: input.error
  });
}

async function processOneBackgroundExport(row: DataExportRequestRow) {
  const claimed = await claimQueuedExport(row);
  if (!claimed) return "skipped" as const;

  const evidence = asEvidence(claimed.evidence_json);
  const presetId = evidence.export_preset as ExportPresetId;
  const format = claimed.format as ExportFormat;
  const preset = resolveExportPreset(presetId);

  try {
    const admin = createAdminSupabaseClient();
    const rows = await getBackgroundExportRows(claimed.organization_id, preset.id, {
      client: admin as never
    });
    const artifact =
      format === "csv"
        ? toCsv(rows, preset.columns)
        : toXlsxBuffer(rows, preset.columns);
      const artifactSizeBytes =
      typeof artifact === "string" ? Buffer.byteLength(artifact, "utf8") : artifact.length;
    const bucket = getAppConfig().supabase.exportStorageBucket;
    const filename = getSafeExportFilename({
      requestId: claimed.id,
      presetId: preset.id,
      format
    });
    const storageObjectPath = getExportArtifactPath({
      organizationId: claimed.organization_id,
      requestId: claimed.id,
      filename
    });
    const contentType = getExportArtifactContentType(format);
    const uploadResult = await admin.storage
      .from(bucket)
      .upload(storageObjectPath, artifact, {
        contentType,
        upsert: false
      });

    if (uploadResult.error) {
      throw new ExportArtifactStorageError(uploadResult.error);
    }

    await markExportCompleted({
      row: claimed,
      presetId: preset.id,
      format,
      rowCount: rows.length,
      artifactSizeBytes,
      storageBucket: bucket,
      storageObjectPath,
      checksumSha256: hashArtifact(artifact),
      contentType,
      filename,
      expiresAt: getExportArtifactExpiresAt()
    });
    return "completed" as const;
  } catch (error) {
    await markExportFailed({
      row: claimed,
      presetId: preset.id,
      format,
      error
    });
    return "failed" as const;
  }
}

async function getScopedBackgroundExportRequest(input: {
  organizationId: string;
  requestId: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("data_export_requests")
    .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
    .eq("id", input.requestId)
    .eq("organization_id", input.organizationId)
    .eq("export_scope", "contracts")
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as DataExportRequestRow | null;
}

export async function downloadBackgroundContractExportArtifact(input: {
  organizationId: string;
  actorUserId: string;
  requestId: string;
}) {
  const row = await getScopedBackgroundExportRequest(input);
  if (!row) {
    throw new BackgroundExportDownloadError(
      "Export artifact was not found.",
      "ERR_EXPORT_ARTIFACT_NOT_FOUND_001",
      404
    );
  }

  const evidence = asEvidence(row.evidence_json);
  if (row.status === "failed") {
    throw new BackgroundExportDownloadError(
      "Export artifact is not available.",
      "ERR_EXPORT_ARTIFACT_FAILED_001",
      409
    );
  }

  if (row.status === "expired" || isExpired(evidence.expires_at)) {
    throw new BackgroundExportDownloadError(
      "Export artifact has expired.",
      "ERR_EXPORT_ARTIFACT_EXPIRED_001",
      410
    );
  }

  if (!isStoredCompletedExport(row, evidence)) {
    throw new BackgroundExportDownloadError(
      "Export artifact is not available.",
      "ERR_EXPORT_ARTIFACT_UNAVAILABLE_001",
      409
    );
  }

  const bucket = evidence.storage_bucket as string;
  const objectPath = evidence.storage_object_path as string;
  const admin = createAdminSupabaseClient();
  const result = await admin.storage.from(bucket).download(objectPath);

  if (result.error || !result.data) {
    await emitOperationalEvent({
      eventName: "export_background_download_failed",
      severity: "P2",
      sensitivity: Boolean(evidence.sensitive_sections_included) ? "customer_sensitive" : "internal",
      alert: true,
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      metadata: {
        export_request_id: row.id,
        export_preset: evidence.export_preset,
        format: row.format
      },
      error: result.error
    });
    throw new BackgroundExportDownloadError(
      "Export artifact could not be downloaded.",
      "ERR_EXPORT_ARTIFACT_DOWNLOAD_FAILED_001",
      500
    );
  }

  const body = await artifactDownloadDataToBuffer(result.data);
  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "contracts.export_background_downloaded",
    entityType: "export",
    entityId: row.id,
    details: {
      export_preset: evidence.export_preset,
      format: row.format,
      row_count: evidence.row_count ?? 0,
      included_sections: evidence.included_sections ?? [],
      sensitive_sections_included: Boolean(evidence.sensitive_sections_included),
      artifact_size_bytes: evidence.artifact_size_bytes ?? body.length,
      expires_at: evidence.expires_at ?? null
    }
  });

  return {
    body,
    filename: String(evidence.filename),
    contentType: String(evidence.content_type),
    artifactSizeBytes: evidence.artifact_size_bytes ?? body.length
  };
}

export async function cleanupExpiredBackgroundExportArtifacts(input?: {
  limit?: number;
}) {
  const limit = Math.min(Math.max(input?.limit ?? 10, 1), 50);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("data_export_requests")
    .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
    .eq("export_scope", "contracts")
    .eq("status", "completed")
    .order("completed_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let expired = 0;
  let deleted = 0;
  let failed = 0;

  for (const row of (data ?? []) as DataExportRequestRow[]) {
    const evidence = asEvidence(row.evidence_json);
    if (!isExpired(evidence.expires_at)) continue;

    const bucket = evidence.storage_bucket;
    const objectPath = evidence.storage_object_path;
    const expiredEvidence = {
      ...evidence,
      status: "expired",
      artifact_storage: "expired",
      download_available: false,
      expired_at: new Date().toISOString()
    };

    try {
      if (typeof bucket === "string" && typeof objectPath === "string") {
        const deleteResult = await admin.storage.from(bucket).remove([objectPath]);
        if (deleteResult.error) throw deleteResult.error;
        deleted += 1;
      }

      await checkedPrivilegedWrite(
        admin
          .from("data_export_requests")
          .update({
            status: "expired",
            evidence_json: expiredEvidence as Json
          })
          .eq("id", row.id),
        {
          operation: "update",
          table: "data_export_requests",
          context: "background_contract_export_expired"
        }
      );

      await createAuditLog({
        organizationId: row.organization_id,
        actorUserId: row.actor_user_id,
        action: "contracts.export_background_expired",
        entityType: "export",
        entityId: row.id,
        details: {
          export_preset: evidence.export_preset,
          format: row.format,
          row_count: evidence.row_count ?? 0,
          artifact_size_bytes: evidence.artifact_size_bytes ?? null,
          expired_at: expiredEvidence.expired_at
        }
      });
      expired += 1;
    } catch (cleanupError) {
      failed += 1;
      await emitOperationalEvent({
        eventName: "export_background_cleanup_failed",
        severity: "P2",
        sensitivity: Boolean(evidence.sensitive_sections_included) ? "customer_sensitive" : "internal",
        alert: true,
        organizationId: row.organization_id,
        actorUserId: row.actor_user_id,
        metadata: {
          export_request_id: row.id,
          export_preset: evidence.export_preset,
          format: row.format
        },
        error: cleanupError
      });
    }
  }

  return {
    ok: failed === 0,
    requestedLimit: limit,
    scanned: (data ?? []).length,
    expired,
    deleted,
    failed
  };
}

export async function processQueuedContractExportRequests(input?: {
  limit?: number;
}) {
  const limit = Math.min(Math.max(input?.limit ?? 3, 1), 10);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("data_export_requests")
    .select("id, organization_id, actor_user_id, export_scope, format, status, requested_at, completed_at, evidence_json")
    .eq("export_scope", "contracts")
    .eq("status", "queued")
    .order("requested_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of (data ?? []) as DataExportRequestRow[]) {
    const result = await processOneBackgroundExport(row);
    if (result === "completed") completed += 1;
    if (result === "failed") failed += 1;
    if (result === "skipped") skipped += 1;
  }

  if (failed > 0) {
    logServerWarn({
      event: "export_background_batch_completed_with_failures",
      metadata: {
        limit,
        completed,
        failed,
        skipped
      }
    });
  }

  return {
    ok: failed === 0,
    requestedLimit: limit,
    claimed: completed + failed + skipped,
    completed,
    failed,
    skipped
  };
}
