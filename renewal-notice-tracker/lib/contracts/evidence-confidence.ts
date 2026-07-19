export type EvidenceConfidenceMetadata = {
  needs_review?: boolean | null;
  has_weak_evidence?: boolean | null;
  is_manual_without_evidence?: boolean | null;
  field_confidence?: Record<string, number> | null;
};

export function clampEvidenceConfidence(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function normalizeFieldConfidence(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
      .map(([key, confidence]) => [key, clampEvidenceConfidence(confidence)])
  );
}

export function getEvidenceConfidenceFromContractMetadata(metadata: EvidenceConfidenceMetadata | null | undefined) {
  if (!metadata) return 0;

  const fieldConfidence = normalizeFieldConfidence(metadata.field_confidence);
  const values = Object.values(fieldConfidence);

  if (values.length === 0) {
    if (metadata.needs_review || metadata.has_weak_evidence || metadata.is_manual_without_evidence) {
      return 0;
    }

    return 0.5;
  }

  return Math.min(...values);
}
