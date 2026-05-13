import { normalizeExtractedText } from "@/lib/extractors/file-text";
import type { ExtractedContractFields } from "@/lib/validation/contract";
import type { OcrProviderResult } from "@/lib/ocr/types";

export function normalizeOcrOutput(result: ExtractedContractFields extends never ? never : Extract<OcrProviderResult, { status: "completed" }>) {
  const pageText = result.pages
    .map((page) => page.text)
    .filter(Boolean)
    .join("\n\n");
  const text = normalizeExtractedText(result.text || pageText);

  return {
    text,
    averageConfidence: result.averageConfidence === null ? null : Math.max(0, Math.min(1, result.averageConfidence))
  };
}

export function applyOcrReviewRequirements(
  metadata: ExtractedContractFields & { needs_review: boolean },
  input: { provider: string; averageConfidence: number | null; reason: string }
) {
  const fieldConfidence = Object.fromEntries(
    Object.entries(metadata.field_confidence).map(([key, value]) => [
      key,
      typeof value === "number" ? Math.min(value, 0.65) : value
    ])
  ) as Record<string, number>;

  const fieldSourceSnippets = Object.fromEntries(
    Object.entries(metadata.field_source_snippets).map(([key, value]) => [
      key,
      value.startsWith("[OCR]") ? value : `[OCR] ${value}`
    ])
  ) as Record<string, string>;

  const reviewerNote = [
    metadata.reviewer_notes,
    `OCR fallback (${input.provider}) was used because ${input.reason.toLowerCase()}. Manual review is required before relying on dates, notice windows, reminders, or decisions.`
  ]
    .filter(Boolean)
    .join(" ");

  return {
    ...metadata,
    field_confidence: fieldConfidence,
    field_source_snippets: fieldSourceSnippets,
    reviewer_notes: reviewerNote,
    needs_review: true
  };
}
