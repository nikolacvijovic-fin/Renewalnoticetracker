import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type {
  PdfContractUploadActionResult,
  PdfUploadAttemptStatus
} from "@/lib/contracts/pdf-upload";

export type PdfUploadAttemptClaim = {
  contractId: string;
  status: PdfUploadAttemptStatus;
  isNew: boolean;
  claimed: boolean;
};

export class PdfUploadCapacityError extends Error {
  constructor() {
    super("Contract tracking capacity has been reached.");
    this.name = "PdfUploadCapacityError";
  }
}

type PdfUploadAttemptRow = {
  id: string;
  organization_id: string;
  status: string;
  latest_file_id: string | null;
  pdf_upload_attempt_id: string | null;
  pdf_upload_attempt_status: string | null;
  pdf_upload_claimed_at: string | null;
  pdf_extraction_job_id: string | null;
  contract_files:
    | Array<{
        id: string;
        file_name: string;
        size_bytes: number;
        storage_deleted_at: string | null;
      }>
    | null;
  contract_metadata:
    | { needs_review: boolean; pdf_renewal_review_reasons?: string[] | null }
    | Array<{ needs_review: boolean; pdf_renewal_review_reasons?: string[] | null }>
    | null;
};

function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function asObject(value: Json | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function parsePdfUploadAttemptClaim(value: Json | null): PdfUploadAttemptClaim {
  const object = asObject(value);
  const status = String(object.status ?? "");
  if (
    typeof object.contractId !== "string" ||
    !["processing", "needs_review", "extraction_failed", "failed", "abandoned", "cleaned"].includes(status)
  ) {
    throw new Error("PDF upload attempt claim returned an invalid state.");
  }

  return {
    contractId: object.contractId,
    status: status as PdfUploadAttemptStatus,
    isNew: object.isNew === true,
    claimed: object.claimed === true
  };
}

export async function claimSaasPdfUploadAttempt(input: {
  organizationId: string;
  uploadAttemptId: string;
  contractTitle: string;
  ownerUserId: string | null;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("claim_saas_pdf_contract_upload", {
    p_organization_id: input.organizationId,
    p_upload_attempt_id: input.uploadAttemptId,
    p_contract_title: input.contractTitle,
    p_owner_user_id: input.ownerUserId
  });

  if (error) {
    const safeHint = "hint" in error ? String(error.hint ?? "") : "";
    if (safeHint === "contract_limit_reached" || error.message === "Contract tracking capacity has been reached.") {
      throw new PdfUploadCapacityError();
    }
    throw error;
  }
  return parsePdfUploadAttemptClaim(data);
}

export function pdfUploadAttemptResultFromRow(input: {
  row: PdfUploadAttemptRow;
  uploadAttemptId: string;
  recovered: boolean;
}): PdfContractUploadActionResult {
  const status = input.row.pdf_upload_attempt_status as PdfUploadAttemptStatus | null;
  const metadata = first(input.row.contract_metadata);
  const file = input.row.contract_files?.find((candidate) =>
    candidate.id === input.row.latest_file_id && !candidate.storage_deleted_at
  ) ?? null;
  const inferredTerminalStatus = input.row.status === "extraction_failed"
    ? "extraction_failed"
    : "needs_review";
  const terminalStatus = status === "extraction_failed"
    ? "extraction_failed"
    : inferredTerminalStatus;
  const reviewReasons = Array.isArray(metadata?.pdf_renewal_review_reasons)
    ? metadata.pdf_renewal_review_reasons.map(String)
    : [];

  if (status === "processing" && !metadata) {
    return {
      ok: true,
      contractId: input.row.id,
      contractFileId: input.row.latest_file_id,
      contractPath: `/dashboard/contracts/${input.row.id}`,
      extractionStatus: "processing",
      needsReview: true,
      reviewReasons: [],
      uploadAttemptId: input.uploadAttemptId,
      jobId: input.row.pdf_extraction_job_id ?? undefined,
      fileName: file?.file_name,
      fileSize: file?.size_bytes,
      recovered: input.recovered,
      safeMessage: "This PDF upload is already processing. Its saved status can be recovered safely."
    };
  }

  if (status === "failed") {
    return {
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The saved PDF upload needs a safe retry. No duplicate contract was created."
    };
  }

  if (status === "abandoned" || status === "cleaned") {
    return {
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "This PDF upload was abandoned and cannot be resumed. Start a new upload when you are ready."
    };
  }

  return {
    ok: true,
    contractId: input.row.id,
    contractFileId: input.row.latest_file_id,
    contractPath: `/dashboard/contracts/${input.row.id}`,
    extractionStatus: terminalStatus,
    needsReview: true,
    reviewReasons,
    uploadAttemptId: input.uploadAttemptId,
    jobId: input.row.pdf_extraction_job_id ?? undefined,
    fileName: file?.file_name,
    fileSize: file?.size_bytes,
    recovered: input.recovered,
    safeMessage: terminalStatus === "extraction_failed"
      ? "The prior PDF upload was recovered. Extraction still needs human attention."
      : "The prior PDF upload was recovered and is ready for human review."
  };
}

export async function getScopedPdfUploadAttemptResult(input: {
  organizationId: string;
  uploadAttemptId: string;
  recovered?: boolean;
}): Promise<PdfContractUploadActionResult | null> {
  const supabase = createServerSupabaseClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .select("id, organization_id, status, latest_file_id, pdf_upload_attempt_id, pdf_upload_attempt_status, pdf_upload_claimed_at, pdf_extraction_job_id")
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .maybeSingle();

  if (error) throw error;
  if (!contract?.id) return null;

  const [metadataResult, fileResult] = await Promise.all([
    supabase
      .from("contract_metadata")
      .select("needs_review, pdf_renewal_review_reasons")
      .eq("contract_id", contract.id)
      .maybeSingle(),
    supabase
      .from("contract_files")
      .select("id, file_name, size_bytes, storage_deleted_at")
      .eq("contract_id", contract.id)
  ]);
  if (metadataResult.error) throw metadataResult.error;
  if (fileResult.error) throw fileResult.error;

  return pdfUploadAttemptResultFromRow({
    row: {
      ...contract,
      contract_metadata: metadataResult.data,
      contract_files: fileResult.data
    },
    uploadAttemptId: input.uploadAttemptId,
    recovered: input.recovered ?? true
  });
}

export async function markScopedPdfUploadAttemptFailed(input: {
  organizationId: string;
  uploadAttemptId: string;
  safeFailureCode: string;
}) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase
    .from("contracts")
    .update({
      pdf_upload_attempt_status: "failed",
      pdf_upload_failure_code: input.safeFailureCode
    })
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .eq("pdf_upload_attempt_status", "processing");

  if (error) throw error;
}

export async function markScopedPdfUploadAttempt(input: {
  organizationId: string;
  contractId: string;
  uploadAttemptId: string;
  status: PdfUploadAttemptStatus;
  safeFailureCode?: string | null;
}) {
  const supabase = createServerSupabaseClient();
  const completed = input.status === "needs_review" || input.status === "extraction_failed";
  const { data, error } = await supabase
    .from("contracts")
    .update({
      pdf_upload_attempt_status: input.status,
      pdf_upload_completed_at: completed ? new Date().toISOString() : null,
      pdf_upload_failure_code: input.safeFailureCode ?? null
    })
    .eq("id", input.contractId)
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error("PDF upload attempt state transition did not match a scoped contract.");
}

export async function abandonScopedPdfUploadAttempt(input: {
  organizationId: string;
  uploadAttemptId: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("abandon_saas_pdf_contract_upload", {
    p_organization_id: input.organizationId,
    p_upload_attempt_id: input.uploadAttemptId
  });
  if (error) throw error;
  const result = asObject(data);
  if (typeof result.contractId !== "string" || result.status !== "abandoned") {
    throw new Error("PDF upload abandon transition returned an invalid state.");
  }
  return {
    contractId: result.contractId,
    status: "abandoned" as const,
    replayed: result.replayed === true
  };
}
