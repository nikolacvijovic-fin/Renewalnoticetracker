import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAppConfig } from "@/lib/config";
import type { Json } from "@/lib/supabase/database.types";

function admin() {
  return createAdminSupabaseClient();
}

export async function linkAdminPdfExtractionJob(input: {
  organizationId: string;
  contractId: string;
  uploadAttemptId: string;
  jobId: string;
}) {
  return admin()
    .from("contracts")
    .update({ pdf_extraction_job_id: input.jobId })
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .eq("pdf_upload_attempt_status", "processing")
    .select("id")
    .maybeSingle();
}

export async function linkAdminPdfUploadFile(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  uploadAttemptId: string;
}) {
  return admin()
    .from("contracts")
    .update({ latest_file_id: input.contractFileId })
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .eq("pdf_upload_attempt_status", "processing")
    .select("id")
    .maybeSingle();
}

export async function getAdminPdfExtractionContext(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  uploadAttemptId: string;
}) {
  const result = await admin()
    .from("contracts")
    .select("id, organization_id, created_by, owner_user_id, status, pdf_upload_attempt_id, pdf_upload_attempt_status, contract_files(id, file_name, mime_type, size_bytes, storage_path, storage_deleted_at)")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .maybeSingle();
  if (result.error) return { data: null, error: result.error };

  const row = result.data as unknown as {
    id: string;
    organization_id: string;
    created_by: string;
    owner_user_id: string | null;
    status: string;
    pdf_upload_attempt_id: string | null;
    pdf_upload_attempt_status: string | null;
    contract_files: Array<{
      id: string;
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      storage_deleted_at: string | null;
    }> | null;
  } | null;
  const file = row?.contract_files?.find((candidate) => candidate.id === input.contractFileId) ?? null;
  if (!row || !file || file.storage_deleted_at) {
    return { data: null, error: new Error("Scoped PDF extraction input is unavailable.") };
  }
  return { data: { ...row, file }, error: null };
}

export async function updateAdminPdfExtractionFile(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  values: Record<string, unknown>;
}) {
  const scoped = await admin()
    .from("contracts")
    .select("id")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (scoped.error || !scoped.data) {
    return { data: null, error: scoped.error ?? new Error("Scoped contract was not found.") };
  }
  return admin()
    .from("contract_files")
    .update(input.values)
    .eq("id", input.contractFileId)
    .eq("contract_id", input.contractId)
    .select("id")
    .maybeSingle();
}

export async function upsertAdminPdfContractMetadata(input: {
  organizationId: string;
  contractId: string;
  values: Record<string, unknown>;
}) {
  const scoped = await admin()
    .from("contracts")
    .select("id")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (scoped.error || !scoped.data) {
    return { data: null, error: scoped.error ?? new Error("Scoped contract was not found.") };
  }
  return admin()
    .from("contract_metadata")
    .upsert({ contract_id: input.contractId, ...input.values }, { onConflict: "contract_id" })
    .select("id")
    .single();
}

export async function replaceAdminPdfEvidenceRows(input: {
  organizationId: string;
  contractId: string;
  metadataId: string;
  rows: Array<{ field_name: string; snippet: string; confidence: number | null; source: string }>;
}) {
  const client = admin();
  const scopedContract = await client
    .from("contracts")
    .select("id")
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (scopedContract.error || !scopedContract.data) {
    return { data: null, error: scopedContract.error ?? new Error("Scoped contract was not found.") };
  }
  const scopedMetadata = await client
    .from("contract_metadata")
    .select("id")
    .eq("id", input.metadataId)
    .eq("contract_id", input.contractId)
    .maybeSingle();
  if (scopedMetadata.error || !scopedMetadata.data) {
    return { data: null, error: scopedMetadata.error ?? new Error("Scoped contract metadata was not found.") };
  }
  const removed = await client
    .from("extracted_field_evidence")
    .delete()
    .eq("contract_metadata_id", input.metadataId);
  if (removed.error || input.rows.length === 0) return removed;
  return client.from("extracted_field_evidence").insert(
    input.rows.map((row) => ({ contract_metadata_id: input.metadataId, ...row }))
  );
}

export async function persistAdminPdfExtractionForReview(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  uploadAttemptId: string;
  jobId: string;
  metadata: Record<string, unknown>;
  evidence: Array<{ field_name: string; snippet: string; confidence: number | null; source: string }>;
  ocrStatus: "completed" | "partial";
  completedAt: string;
}) {
  return admin().rpc("persist_saas_pdf_extraction_for_review", {
    p_organization_id: input.organizationId,
    p_contract_id: input.contractId,
    p_contract_file_id: input.contractFileId,
    p_upload_attempt_id: input.uploadAttemptId,
    p_job_id: input.jobId,
    p_metadata: input.metadata as Json,
    p_evidence: input.evidence as Json,
    p_ocr_status: input.ocrStatus,
    p_completed_at: input.completedAt
  });
}

export async function transitionAdminPdfUploadAttempt(input: {
  organizationId: string;
  contractId: string;
  uploadAttemptId: string;
  allowedStatuses: string[];
  values: Record<string, unknown>;
}) {
  return admin()
    .from("contracts")
    .update(input.values)
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .in("pdf_upload_attempt_status", input.allowedStatuses)
    .select("id, pdf_upload_attempt_status")
    .maybeSingle();
}

export async function listAdminStalePdfUploadAttempts(input: {
  staleBeforeIso: string;
  limit: number;
}) {
  return admin()
    .from("contracts")
    .select("id, organization_id, latest_file_id, pdf_upload_attempt_id, pdf_upload_attempt_status, pdf_upload_claimed_at, pdf_upload_abandoned_at, pdf_upload_cleaned_at, contract_metadata(id, reviewed_at), saas_contract_terms(id), contract_files(id, storage_deleted_at)")
    .in("pdf_upload_attempt_status", ["failed", "abandoned", "cleanup_processing"])
    .or([
      `and(pdf_upload_attempt_status.eq.failed,pdf_upload_claimed_at.lt.${input.staleBeforeIso})`,
      `and(pdf_upload_attempt_status.eq.abandoned,pdf_upload_abandoned_at.lt.${input.staleBeforeIso})`,
      `and(pdf_upload_attempt_status.eq.cleanup_processing,pdf_upload_cleaned_at.lt.${input.staleBeforeIso})`
    ].join(","))
    .order("pdf_upload_claimed_at", { ascending: true, nullsFirst: true })
    .limit(input.limit);
}

export async function cleanAdminPdfUploadStorage(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string | null;
  cleanedAt: string;
  staleBeforeIso: string;
}) {
  const client = admin();
  const cleanupClaim = await client.rpc("claim_saas_pdf_upload_cleanup", {
    p_organization_id: input.organizationId,
    p_contract_id: input.contractId,
    p_contract_file_id: input.contractFileId,
    p_stale_before: input.staleBeforeIso
  });
  if (cleanupClaim.error) return { data: null, error: cleanupClaim.error };
  const claim = cleanupClaim.data && typeof cleanupClaim.data === "object" && !Array.isArray(cleanupClaim.data)
    ? cleanupClaim.data as Record<string, unknown>
    : {};
  if (claim.claimed !== true || claim.contractId !== input.contractId) {
    return { data: null, error: new Error("Scoped cleanup candidate was not claimed.") };
  }
  const fromStatus = claim.fromStatus === "failed" || claim.fromStatus === "abandoned"
    ? claim.fromStatus
    : null;
  const releaseClaim = async () => {
    if (!fromStatus) return;
    await client
      .from("contracts")
      .update({ pdf_upload_attempt_status: fromStatus, pdf_upload_cleaned_at: null })
      .eq("id", input.contractId)
      .eq("organization_id", input.organizationId)
      .eq("pdf_upload_attempt_status", "cleanup_processing");
  };

  if (input.contractFileId) {
    const fileRecord = await client
      .from("contract_files")
      .select("id, storage_path, storage_deleted_at")
      .eq("id", input.contractFileId)
      .eq("contract_id", input.contractId)
      .maybeSingle();
    if (fileRecord.error || !fileRecord.data) {
      await releaseClaim();
      return { data: null, error: fileRecord.error ?? new Error("Scoped cleanup file was not found.") };
    }
    if (!fileRecord.data.storage_deleted_at) {
      const removed = await client.storage
        .from(getAppConfig().supabase.storageBucket)
        .remove([fileRecord.data.storage_path]);
      if (removed.error) {
        await releaseClaim();
        return { data: null, error: removed.error };
      }
      const file = await client
        .from("contract_files")
        .update({
          storage_deleted_at: input.cleanedAt,
          extracted_text: null,
          extraction_error: "Upload attempt was cleaned after its retention window."
        })
        .eq("id", input.contractFileId)
        .eq("contract_id", input.contractId)
        .select("id")
        .maybeSingle();
      if (file.error) return file;
    }
  }

  return client
    .from("contracts")
    .update({
      status: "archived",
      status_tag: "terminated",
      pdf_upload_attempt_status: "cleaned",
      pdf_upload_cleaned_at: input.cleanedAt,
      pdf_upload_failure_code: "upload_attempt_cleaned"
    })
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_status", "cleanup_processing")
    .select("id")
    .maybeSingle();
}

export async function getAdminPdfUploadAttemptMetrics() {
  return admin()
    .from("contracts")
    .select("pdf_upload_attempt_status, pdf_upload_claimed_at, pdf_upload_recovery_count")
    .not("pdf_upload_attempt_id", "is", null);
}
