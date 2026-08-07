import { LOW_CONFIDENCE_THRESHOLD } from "@/lib/constants";
import type { ExtractedContractFields } from "@/lib/validation/contract";

export const PDF_RENEWAL_CRITICAL_FIELDS = [
  "notice_deadline_date",
  "renewal_date",
  "expiration_date",
  "auto_renewal",
  "contract_value_amount",
  "contract_value_currency"
] as const;

export type PdfRenewalCriticalField = (typeof PDF_RENEWAL_CRITICAL_FIELDS)[number];

export type PdfRenewalReviewReason =
  | "missing_notice_deadline"
  | "weak_evidence"
  | "inferred_from_notice_period"
  | "conflicting_dates"
  | "manual_review_required"
  | "ocr_low_confidence";

const MAX_REVIEW_SNIPPET_LENGTH = 240;
const SENSITIVE_SNIPPET_PATTERN =
  /raw\s+(?:contract|document|ocr)|provider payload|secret|token|bearer|authorization|storage path|uploaded document|private note|email body/i;

function sanitizeSnippet(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (SENSITIVE_SNIPPET_PATTERN.test(normalized)) return null;
  return normalized.length > MAX_REVIEW_SNIPPET_LENGTH
    ? `${normalized.slice(0, MAX_REVIEW_SNIPPET_LENGTH - 3)}...`
    : normalized;
}

function hasValue(metadata: ExtractedContractFields & { needs_review?: boolean }, field: PdfRenewalCriticalField) {
  const value = metadata[field];
  return value !== null && value !== undefined && value !== "";
}

function dateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hasConflictingDates(metadata: ExtractedContractFields) {
  const notice = dateValue(metadata.notice_deadline_date);
  const renewal = dateValue(metadata.renewal_date);
  const expiration = dateValue(metadata.expiration_date);

  if (notice && renewal && notice.getTime() > renewal.getTime()) return true;
  if (notice && expiration && notice.getTime() > expiration.getTime()) return true;
  if (renewal && expiration && renewal.getTime() > expiration.getTime()) return true;
  return false;
}

export function buildPdfRenewalReviewReasons(
  metadata: ExtractedContractFields & { needs_review?: boolean },
  input: {
    extractionSource?: "native_text" | "ocr" | string | null;
    ocrConfidence?: number | null;
    parserError?: string | null;
  } = {}
): PdfRenewalReviewReason[] {
  const reasons = new Set<PdfRenewalReviewReason>();

  if (!metadata.notice_deadline_date) reasons.add("missing_notice_deadline");
  for (const field of PDF_RENEWAL_CRITICAL_FIELDS) {
    const confidence = metadata.field_confidence[field] ?? 0;
    const snippet = sanitizeSnippet(metadata.field_source_snippets[field]);
    if (!hasValue(metadata, field) || confidence < LOW_CONFIDENCE_THRESHOLD || !snippet) {
      reasons.add("weak_evidence");
    }
  }
  if (
    metadata.notice_deadline_date &&
    metadata.notice_period_value &&
    metadata.notice_period_unit &&
    !sanitizeSnippet(metadata.field_source_snippets.notice_deadline_date)
  ) {
    reasons.add("inferred_from_notice_period");
  }
  if (hasConflictingDates(metadata)) reasons.add("conflicting_dates");
  if (input.parserError || metadata.needs_review) reasons.add("manual_review_required");
  if (
    input.extractionSource === "ocr" ||
    (typeof input.ocrConfidence === "number" && input.ocrConfidence < LOW_CONFIDENCE_THRESHOLD)
  ) {
    reasons.add("ocr_low_confidence");
  }
  if (reasons.size > 0) reasons.add("manual_review_required");

  return Array.from(reasons);
}

export function normalizePdfRenewalEvidenceSnippets(
  snippets: Record<string, string> | null | undefined
) {
  return Object.fromEntries(
    Object.entries(snippets ?? {})
      .map(([field, value]) => [field, sanitizeSnippet(value)])
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  );
}

export function preparePdfRenewalExtractionForReview(
  metadata: ExtractedContractFields & { needs_review: boolean },
  input: {
    extractionSource?: "native_text" | "ocr" | string | null;
    ocrConfidence?: number | null;
    parserError?: string | null;
  } = {}
): ExtractedContractFields & { needs_review: boolean; pdf_renewal_review_reasons: PdfRenewalReviewReason[] } {
  const fieldSourceSnippets = normalizePdfRenewalEvidenceSnippets(metadata.field_source_snippets);
  const assessedMetadata = {
    ...metadata,
    field_source_snippets: fieldSourceSnippets
  };
  const reviewReasons = buildPdfRenewalReviewReasons(assessedMetadata, input);
  const reviewNote = reviewReasons.length > 0
    ? `PDF renewal extraction requires review: ${reviewReasons.join(", ")}.`
    : null;

  return {
    ...assessedMetadata,
    needs_review: metadata.needs_review || reviewReasons.length > 0,
    reviewer_notes: [metadata.reviewer_notes, reviewNote].filter(Boolean).join(" ") || null,
    pdf_renewal_review_reasons: reviewReasons
  };
}

export function applyManualPdfRenewalCorrections(input: {
  previous: Partial<Record<PdfRenewalCriticalField, string | number | boolean | null | undefined>> | null | undefined;
  next: ExtractedContractFields;
  fieldConfidence: Record<string, number>;
  fieldSourceSnippets: Record<string, string>;
  now?: string;
}) {
  const now = input.now ?? new Date().toISOString();
  const fieldConfidence = { ...input.fieldConfidence };
  const fieldSourceSnippets = { ...input.fieldSourceSnippets };
  const correctedFields: PdfRenewalCriticalField[] = [];

  for (const field of PDF_RENEWAL_CRITICAL_FIELDS) {
    const previousValue = input.previous?.[field] ?? null;
    const nextValue = input.next[field] ?? null;
    if (previousValue !== nextValue && nextValue !== null && nextValue !== undefined && nextValue !== "") {
      correctedFields.push(field);
      fieldConfidence[field] = 1;
      fieldSourceSnippets[field] = `Manual correction reviewed in NoticeControl on ${now.slice(0, 10)}.`;
    }
  }

  return {
    fieldConfidence,
    fieldSourceSnippets,
    correctedFields
  };
}
