import { isExtractedTextEmpty } from "@/lib/extractors/file-text";

export type OcrNeedDecision = {
  shouldUseOcr: boolean;
  reason: string;
  confidence: "high" | "medium" | "low";
  asynchronousPreferred: boolean;
  qualityScore: number;
};

function computeAlphaRatio(text: string) {
  const visible = text.replace(/\s/g, "");
  if (visible.length === 0) return 0;
  const letters = visible.match(/[A-Za-z0-9]/g)?.length ?? 0;
  return letters / visible.length;
}

export function detectOcrNeed(input: {
  mimeType: string;
  sizeBytes: number;
  extractedText: string | null;
  extractionError: string | null;
}) : OcrNeedDecision {
  const text = input.extractedText ?? "";
  const trimmedLength = text.trim().length;
  const alphaRatio = computeAlphaRatio(text);
  const qualityScore = Math.max(0, Math.min(100, Math.round((trimmedLength >= 200 ? 50 : trimmedLength / 4) + alphaRatio * 50)));
  const asynchronousPreferred = input.mimeType === "application/pdf" && input.sizeBytes > 5 * 1024 * 1024;

  if (isExtractedTextEmpty(text)) {
    return {
      shouldUseOcr: true,
      reason: "Native extraction returned no usable text.",
      confidence: "high",
      asynchronousPreferred,
      qualityScore
    };
  }

  if (input.extractionError && trimmedLength < 80) {
    return {
      shouldUseOcr: true,
      reason: "Native extraction reported an error and produced too little text.",
      confidence: "high",
      asynchronousPreferred,
      qualityScore
    };
  }

  if (input.mimeType === "application/pdf" && trimmedLength < 60) {
    return {
      shouldUseOcr: true,
      reason: "PDF text payload is too short to trust without OCR fallback.",
      confidence: "medium",
      asynchronousPreferred,
      qualityScore
    };
  }

  if (input.mimeType === "application/pdf" && alphaRatio < 0.45) {
    return {
      shouldUseOcr: true,
      reason: "Extracted PDF text quality looks too degraded to trust as native text.",
      confidence: "medium",
      asynchronousPreferred,
      qualityScore
    };
  }

  return {
    shouldUseOcr: false,
    reason: "Native extraction quality looks acceptable.",
    confidence: "low",
    asynchronousPreferred,
    qualityScore
  };
}
