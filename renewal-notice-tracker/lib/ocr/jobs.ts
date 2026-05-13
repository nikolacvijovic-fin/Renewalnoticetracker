import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { getOcrProvider } from "@/lib/ocr/provider";
import { normalizeOcrOutput, applyOcrReviewRequirements } from "@/lib/ocr/normalize-ocr-output";
import { extractContractMetadata } from "@/lib/ai/extract-contract";
import { buildEvidenceRows } from "@/lib/contracts/evidence";
import { sanitizeInternalError } from "@/lib/errors";
import { recordProcessingError } from "@/lib/contracts/processing-errors";

type OcrJobRow = {
  id: string;
  organization_id: string;
  contract_id: string;
  contract_file_id: string;
  provider: string;
  status: string;
  detection_reason: string | null;
  attempts: number;
};

export async function enqueueOcrJob(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  provider: string;
  detectionReason: string;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("ocr_jobs")
    .insert({
      organization_id: input.organizationId,
      contract_id: input.contractId,
      contract_file_id: input.contractFileId,
      provider: input.provider,
      detection_reason: input.detectionReason,
      details_json: (input.details ?? {}) as Json
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

async function claimOcrJob(job: OcrJobRow) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("ocr_jobs")
    .update({
      status: "processing",
      attempts: job.attempts + 1,
      started_at: new Date().toISOString(),
      error_message: null
    })
    .eq("id", job.id)
    .eq("organization_id", job.organization_id)
    .in("status", ["pending", "retry_pending"])
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as OcrJobRow | null;
}

async function getScopedMetadataIdForAdmin(contractId: string, organizationId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("contracts")
    .select("contract_metadata(id)")
    .eq("id", contractId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  const typed = data as
    | {
        contract_metadata:
          | { id: string }
          | Array<{ id: string }>
          | null;
      }
    | null;
  const metadataId = Array.isArray(typed?.contract_metadata)
    ? typed?.contract_metadata[0]?.id
    : typed?.contract_metadata?.id;

  if (!metadataId) {
    throw new Error("Contract metadata not found for OCR job.");
  }

  return metadataId;
}

export async function processPendingOcrJobs(limit = 5) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("ocr_jobs")
    .select("id, organization_id, contract_id, contract_file_id, provider, status, detection_reason, attempts")
    .in("status", ["pending", "retry_pending"])
    .order("queued_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const job of (data ?? []) as OcrJobRow[]) {
    const claimed = await claimOcrJob(job);
    if (!claimed) continue;

    try {
      const { data: fileRow, error: fileError } = await admin
        .from("contract_files")
        .select("file_name, mime_type")
        .eq("id", claimed.contract_file_id)
        .eq("contract_id", claimed.contract_id)
        .single();
      if (fileError) throw fileError;

      const provider = getOcrProvider();
      const result = await provider.performOcr({
        buffer: Buffer.from("queued-ocr"),
        fileName: fileRow.file_name,
        mimeType: fileRow.mime_type,
        asynchronousPreferred: false
      });

      if (result.status !== "completed") {
        throw new Error(result.error);
      }

      const normalized = normalizeOcrOutput(result);
      const metadata = applyOcrReviewRequirements(
        await extractContractMetadata(normalized.text),
        {
          provider: result.provider,
          averageConfidence: result.averageConfidence,
          reason: claimed.detection_reason ?? "native extraction quality was too weak"
        }
      );

      const metadataId = await getScopedMetadataIdForAdmin(claimed.contract_id, claimed.organization_id);

      await admin
        .from("contract_files")
        .update({
          extracted_text: normalized.text,
          extraction_error: null,
          extraction_source: "ocr",
          ocr_provider: result.provider,
          ocr_status: "completed",
          ocr_confidence: normalized.averageConfidence,
          ocr_detected_needed: true
        })
        .eq("id", claimed.contract_file_id)
        .eq("contract_id", claimed.contract_id);

      await admin
        .from("contract_metadata")
        .update({
          contract_title: metadata.contract_title,
          counterparty_name: metadata.counterparty_name,
          contract_type: metadata.contract_type,
          effective_date: metadata.effective_date,
          expiration_date: metadata.expiration_date,
          auto_renewal: metadata.auto_renewal,
          renewal_term: metadata.renewal_term,
          notice_period_value: metadata.notice_period_value,
          notice_period_unit: metadata.notice_period_unit,
          notice_deadline_date: metadata.notice_deadline_date,
          governing_law: metadata.governing_law,
          payment_terms: metadata.payment_terms,
          extracted_clauses: metadata.extracted_clauses,
          field_confidence: metadata.field_confidence,
          field_source_snippets: metadata.field_source_snippets,
          reminder_recommendations: metadata.reminder_recommendations,
          reviewer_notes: metadata.reviewer_notes,
          needs_review: true
        })
        .eq("id", metadataId);

      await admin.from("extracted_field_evidence").delete().eq("contract_metadata_id", metadataId);
      const rows = buildEvidenceRows(
        metadata.field_source_snippets,
        metadata.field_confidence,
        "ocr"
      );
      if (rows.length > 0) {
        await admin.from("extracted_field_evidence").insert(
          rows.map((row) => ({
            contract_metadata_id: metadataId,
            field_name: row.field_name,
            snippet: row.snippet,
            confidence: row.confidence,
            source: row.source
          }))
        );
      }

      await admin
        .from("contracts")
        .update({ status: "needs_review" })
        .eq("id", claimed.contract_id)
        .eq("organization_id", claimed.organization_id);

      if (result.estimatedCost !== null) {
        await admin.from("cost_usage_logs").insert({
          organization_id: claimed.organization_id,
          cost_category: "ocr",
          quantity: 1,
          unit: "document",
          estimated_cost: result.estimatedCost,
          reference_key: claimed.contract_id,
          details: {
            provider: result.provider,
            mode: result.processingMode,
            source: "ocr_job"
          }
        });
      }

      await admin
        .from("ocr_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          details_json: {
            provider: result.provider,
            average_confidence: normalized.averageConfidence
          }
        })
        .eq("id", claimed.id)
        .eq("organization_id", claimed.organization_id);

      results.push({ id: claimed.id, status: "completed" });
    } catch (error) {
      const message = sanitizeInternalError(error);
      await recordProcessingError({
        organizationId: claimed.organization_id,
        contractId: claimed.contract_id,
        contractFileId: claimed.contract_file_id,
        stage: "ocr",
        message,
        details: { job_id: claimed.id }
      });

      await admin
        .from("ocr_jobs")
        .update({
          status: claimed.attempts + 1 >= 2 ? "failed_terminal" : "retry_pending",
          error_message: message
        })
        .eq("id", claimed.id)
        .eq("organization_id", claimed.organization_id);

      results.push({ id: claimed.id, status: "failed", error: message });
    }
  }

  return results;
}
