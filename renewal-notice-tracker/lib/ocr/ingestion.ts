import type { ExtractedDocumentText } from "@/lib/extractors/file-text";
import { getOcrProvider } from "@/lib/ocr/provider";
import { detectOcrNeed, type OcrNeedDecision } from "@/lib/ocr/detect-ocr-need";
import { normalizeOcrOutput } from "@/lib/ocr/normalize-ocr-output";

export type DocumentIngestionResult = {
  text: string | null;
  error: string | null;
  source: "native_text" | "ocr";
  ocrDetectedNeeded: boolean;
  ocrDecision: OcrNeedDecision;
  ocrProvider: string | null;
  ocrStatus: string | null;
  ocrConfidence: number | null;
  ocrEstimatedCost: number | null;
};

export async function resolveDocumentTextForExtraction(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  nativeExtraction: ExtractedDocumentText;
}) : Promise<DocumentIngestionResult> {
  const ocrDecision = detectOcrNeed({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    extractedText: input.nativeExtraction.text,
    extractionError: input.nativeExtraction.error
  });

  if (!ocrDecision.shouldUseOcr || input.mimeType !== "application/pdf") {
    return {
      text: input.nativeExtraction.text,
      error: input.nativeExtraction.error,
      source: "native_text",
      ocrDetectedNeeded: ocrDecision.shouldUseOcr,
      ocrDecision,
      ocrProvider: null,
      ocrStatus: null,
      ocrConfidence: null,
      ocrEstimatedCost: null
    };
  }

  const provider = getOcrProvider();
  const result = await provider.performOcr({
    buffer: input.buffer,
    fileName: input.fileName,
    mimeType: input.mimeType,
    asynchronousPreferred: ocrDecision.asynchronousPreferred
  });

  if (result.status !== "completed") {
    return {
      text: input.nativeExtraction.text,
      error: result.error,
      source: "native_text",
      ocrDetectedNeeded: true,
      ocrDecision,
      ocrProvider: result.provider,
      ocrStatus: result.status,
      ocrConfidence: result.averageConfidence,
      ocrEstimatedCost: result.estimatedCost
    };
  }

  const normalized = normalizeOcrOutput(result);

  return {
    text: normalized.text,
    error: normalized.text ? null : "OCR returned no usable text.",
    source: "ocr",
    ocrDetectedNeeded: true,
    ocrDecision,
    ocrProvider: result.provider,
    ocrStatus: result.status,
    ocrConfidence: normalized.averageConfidence,
    ocrEstimatedCost: result.estimatedCost
  };
}
