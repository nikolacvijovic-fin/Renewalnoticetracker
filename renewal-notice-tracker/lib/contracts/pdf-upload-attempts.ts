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

type PdfUploadAttemptRow = {
  id: string;
  organization_id: string;
  status: string;
  latest_file_id: string | null;
  pdf_upload_attempt_id: string | null;
  pdf_upload_attempt_status: string | null;
  pdf_upload_claimed_at: string | null;
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
    !["processing", "needs_review", "extraction_failed", "failed"].includes(status)
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

  if (error) throw error;
  return parsePdfUploadAttemptClaim(data);
}

export function pdfUploadAttemptResultFromRow(input: {
  row: PdfUploadAttemptRow;
  uploadAttemptId: string;
  recovered: boolean;
}): PdfContractUploadActionResult {
  const status = input.row.pdf_upload_attempt_status as PdfUploadAttemptStatus | null;
  const metadata = first(input.row.contract_metadata);
  const inferredTerminalStatus = input.row.status === "extraction_failed"
    ? "extraction_failed"
    : "needs_review";
  const terminalStatus = status === "extraction_failed"
    ? "extraction_failed"
    : inferredTerminalStatus;
  const reviewReasons = Array.isArray(metadata?.pdf_renewal_review_reasons)
    ? metadata.pdf_renewal_review_reasons.map(String)
    : [];

  const staleProcessing = status === "processing" && input.row.pdf_upload_claimed_at
    ? Date.parse(input.row.pdf_upload_claimed_at) <= Date.now() - 15 * 60_000
    : false;

  if (staleProcessing && !metadata) {
    return {
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The saved PDF processing claim expired. Retry to resume without creating another contract."
    };
  }

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

  return {
    ok: true,
    contractId: input.row.id,
    contractFileId: input.row.latest_file_id,
    contractPath: `/dashboard/contracts/${input.row.id}`,
    extractionStatus: terminalStatus,
    needsReview: true,
    reviewReasons,
    uploadAttemptId: input.uploadAttemptId,
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
    .select("id, organization_id, status, latest_file_id, pdf_upload_attempt_id, pdf_upload_attempt_status, pdf_upload_claimed_at")
    .eq("organization_id", input.organizationId)
    .eq("pdf_upload_attempt_id", input.uploadAttemptId)
    .maybeSingle();

  if (error) throw error;
  if (!contract?.id) return null;

  const { data: metadata, error: metadataError } = await supabase
    .from("contract_metadata")
    .select("needs_review")
    .eq("contract_id", contract.id)
    .maybeSingle();
  if (metadataError) throw metadataError;

  return pdfUploadAttemptResultFromRow({
    row: {
      ...contract,
      contract_metadata: metadata
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
