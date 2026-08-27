import {
  applySelectiveOcrFallback,
  parseContractDocument,
  type ParsedContractDocument
} from "@/lib/contract-intelligence/document-parser";
import { getOcrProvider } from "@/lib/ocr/provider";
import type { OcrProvider } from "@/lib/ocr/types";

export async function prepareCommercialProposalDocument(input: {
  fileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  parseDocument?: typeof parseContractDocument;
  applyOcrFallback?: typeof applySelectiveOcrFallback;
  ocrProvider?: OcrProvider;
}): Promise<{ document: ParsedContractDocument; ocrAttempted: boolean; requiresReview: boolean }> {
  const parse = input.parseDocument ?? parseContractDocument;
  const applyOcr = input.applyOcrFallback ?? applySelectiveOcrFallback;
  let document = await parse({ fileId: input.fileId, buffer: input.buffer, mimeType: input.mimeType });
  const needsOcr = input.mimeType === "application/pdf" &&
    document.pages.some((page) => page.warningCodes.includes("native_page_text_insufficient"));
  if (!needsOcr) return { document, ocrAttempted: false, requiresReview: false };

  try {
    document = await applyOcr({
      document,
      originalPdf: input.buffer,
      fileName: input.fileName,
      provider: input.ocrProvider ?? getOcrProvider()
    });
  } catch {
    document = {
      ...document,
      warnings: Array.from(new Set([...document.warnings, "ocr_provider_unavailable"]))
    };
  }
  const requiresReview = document.pages.some((page) =>
    page.warningCodes.includes("ocr_page_failed") || page.warningCodes.includes("ocr_low_confidence")
  ) || document.warnings.includes("ocr_provider_unavailable");
  return { document, ocrAttempted: true, requiresReview };
}
