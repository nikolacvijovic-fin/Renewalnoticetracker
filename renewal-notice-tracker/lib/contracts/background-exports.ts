import { createAuditLog } from "@/lib/audit";
import type { ActiveOrganizationContext } from "@/lib/auth";
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

function asEvidence(value: Json | null | undefined): EvidenceRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as EvidenceRecord) }
    : {};
}

function getBackgroundExportEvidence(input: {
  presetId: ExportPresetId;
  format: ExportFormat;
  source: "background_export_request" | "background_export_processor";
  status: BackgroundExportStatus;
  rowCount?: number;
  artifactSizeBytes?: number;
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
    artifact_storage: "deferred",
    download_available: false,
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

export function toBackgroundExportStatusResponse(row: DataExportRequestRow) {
  const evidence = asEvidence(row.evidence_json);
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
    downloadAvailable: false,
    artifactStorage: evidence.artifact_storage ?? "deferred"
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

    await markExportCompleted({
      row: claimed,
      presetId: preset.id,
      format,
      rowCount: rows.length,
      artifactSizeBytes
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
