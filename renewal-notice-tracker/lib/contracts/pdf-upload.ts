export const MAX_CONTRACT_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_CONTRACT_PDF_BYTES = MAX_CONTRACT_UPLOAD_BYTES;
export const MAX_CONTRACT_PDF_BATCH_FILES = 10;

export const PDF_UPLOAD_ERROR_MESSAGES = {
  empty_file: "The PDF is empty. Choose a contract PDF with content.",
  invalid_file_type: "Only PDF contract files are accepted on this page.",
  too_many_files: `Choose no more than ${MAX_CONTRACT_PDF_BATCH_FILES} PDFs at a time.`,
  file_too_large: "The PDF exceeds the 15 MiB upload limit."
} as const;

export type PdfUploadValidationErrorCode = keyof typeof PDF_UPLOAD_ERROR_MESSAGES;

export type PdfUploadCandidate = {
  name: string;
  type: string;
  size: number;
};

export type PdfUploadValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: Exclude<PdfUploadValidationErrorCode, "too_many_files">;
      safeMessage: string;
    };

export type PdfContractUploadActionResult =
  | {
      ok: true;
      contractId: string;
      contractFileId: string;
      contractPath: string;
      extractionStatus: "needs_review" | "extraction_failed";
      needsReview: true;
      reviewReasons: string[];
      safeMessage: string;
    }
  | {
      ok: false;
      errorCode:
        | PdfUploadValidationErrorCode
        | "authentication_required"
        | "permission_denied"
        | "contract_limit_reached"
        | "upload_failed";
      safeMessage: string;
    };

export function validateContractPdf(candidate: PdfUploadCandidate): PdfUploadValidationResult {
  if (candidate.size <= 0) {
    return {
      ok: false,
      code: "empty_file",
      safeMessage: PDF_UPLOAD_ERROR_MESSAGES.empty_file
    };
  }

  if (candidate.type !== "application/pdf" || !candidate.name.toLowerCase().endsWith(".pdf")) {
    return {
      ok: false,
      code: "invalid_file_type",
      safeMessage: PDF_UPLOAD_ERROR_MESSAGES.invalid_file_type
    };
  }

  if (candidate.size > MAX_CONTRACT_PDF_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      safeMessage: PDF_UPLOAD_ERROR_MESSAGES.file_too_large
    };
  }

  return { ok: true };
}

type PdfSignatureReadable = {
  size: number;
  slice(start?: number, end?: number): {
    arrayBuffer(): Promise<ArrayBuffer>;
  };
};

export async function hasContractPdfSignature(file: PdfSignatureReadable) {
  if (file.size < 5) return false;
  const signature = new TextDecoder("ascii").decode(await file.slice(0, 5).arrayBuffer());
  return signature === "%PDF-";
}

export function sanitizeContractPdfFileName(fileName: string) {
  const leafName = fileName.split(/[\\/]/).pop() ?? "contract.pdf";
  const withoutExtension = leafName.replace(/\.pdf$/i, "");
  const safeBase = withoutExtension
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);

  return `${safeBase || "contract"}.pdf`;
}

export function contractTitleFromPdfFileName(fileName: string) {
  const safeName = sanitizeContractPdfFileName(fileName);
  const title = safeName
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return title.length >= 2 ? title : "Uploaded contract";
}
