import { createAuditLog } from "@/lib/audit";
import { getAppConfig } from "@/lib/config";
import {
  cleanAdminPdfUploadStorage,
  getAdminPdfUploadAttemptMetrics,
  listAdminStalePdfUploadAttempts
} from "@/lib/contracts/repositories/admin-pdf-upload-repository";
import { emitOperationalEvent } from "@/lib/observability/monitoring";

type CleanupCandidate = {
  id: string;
  organization_id: string;
  latest_file_id: string | null;
  pdf_upload_attempt_id: string | null;
  pdf_upload_attempt_status: string | null;
  contract_metadata: Array<{ id: string; reviewed_at: string | null }> | null;
  saas_contract_terms: Array<{ id: string }> | null;
  contract_files: Array<{ id: string; storage_deleted_at: string | null }> | null;
};

export async function cleanupStalePdfUploadAttempts(input: {
  now?: Date;
  limit?: number;
} = {}) {
  const now = input.now ?? new Date();
  const retentionHours = getAppConfig().operations.pdfUploadAttemptRetentionHours;
  const staleBeforeIso = new Date(now.getTime() - retentionHours * 60 * 60_000).toISOString();
  const result = await listAdminStalePdfUploadAttempts({
    staleBeforeIso,
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
    nowIso: now.toISOString()
  });
  if (result.error) throw result.error;

  let cleaned = 0;
  let protectedCount = 0;
  let failedCount = 0;
  for (const row of (result.data ?? []) as unknown as CleanupCandidate[]) {
    const reviewed = (row.contract_metadata ?? []).some((metadata) => Boolean(metadata.reviewed_at));
    const activated = (row.saas_contract_terms ?? []).length > 0;
    if (reviewed || activated) {
      protectedCount += 1;
      continue;
    }
    const contractFiles = row.contract_files ?? [];
    const undeletedFiles = contractFiles.filter((candidate) => !candidate.storage_deleted_at);
    const file = contractFiles.find((candidate) => candidate.id === row.latest_file_id) ??
      (row.latest_file_id === null && undeletedFiles.length === 1 ? undeletedFiles[0] : null);
    const cleanup = await cleanAdminPdfUploadStorage({
      organizationId: row.organization_id,
      contractId: row.id,
      contractFileId: file?.id ?? null,
      cleanedAt: now.toISOString(),
      staleBeforeIso
    });
    if (cleanup.error || !cleanup.data) {
      failedCount += 1;
      continue;
    }
    cleaned += 1;
    await createAuditLog({
      organizationId: row.organization_id,
      contractId: row.id,
      action: "saas.pdf_upload_cleaned",
      entityType: "contract",
      entityId: row.id,
      details: {
        upload_attempt_id: row.pdf_upload_attempt_id,
        from_status: row.pdf_upload_attempt_status,
        to_status: "cleaned",
        retention_hours: retentionHours
      }
    }, { mode: "best_effort" });
  }

  void emitOperationalEvent({
    eventName: "saas_pdf_upload_cleanup_completed",
    severity: "P3",
    sensitivity: "internal",
    alert: false,
    action: "pdf_upload_cleanup",
    metadata: {
      candidate_count: result.data?.length ?? 0,
      cleaned_count: cleaned,
      protected_count: protectedCount,
      failed_count: failedCount,
      retention_hours: retentionHours
    }
  });
  return { cleaned, protectedCount, failedCount, candidateCount: result.data?.length ?? 0, retentionHours };
}

export async function getPdfUploadAttemptOperationalMetrics(input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const result = await getAdminPdfUploadAttemptMetrics();
  if (result.error) throw result.error;
  const staleBefore = now.getTime() - 15 * 60_000;
  const rows = (result.data ?? []) as Array<{
    pdf_upload_attempt_status: string | null;
    pdf_upload_claimed_at: string | null;
    pdf_upload_recovery_count: number;
  }>;
  const count = (status: string) => rows.filter((row) => row.pdf_upload_attempt_status === status).length;
  return {
    processing: count("processing"),
    stale: rows.filter((row) =>
      row.pdf_upload_attempt_status === "processing" &&
      Boolean(row.pdf_upload_claimed_at) &&
      Date.parse(row.pdf_upload_claimed_at as string) <= staleBefore
    ).length,
    failed: count("failed") + count("extraction_failed"),
    abandoned: count("abandoned"),
    recovered: rows.reduce((total, row) => total + Math.max(0, row.pdf_upload_recovery_count ?? 0), 0),
    cleaned: count("cleaned")
  };
}
