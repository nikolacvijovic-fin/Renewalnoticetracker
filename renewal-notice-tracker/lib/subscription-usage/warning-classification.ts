export const EVIDENCE_WARNING_CLASSES = [
  "informational",
  "caution",
  "evidence_partial",
  "evidence_stale",
  "evidence_missing",
  "evidence_conflicting",
  "blocking"
] as const;

export type EvidenceWarningClass = (typeof EVIDENCE_WARNING_CLASSES)[number];

const WARNING_CLASS_BY_CODE: Record<string, EvidenceWarningClass> = {
  possible_overlap_not_proof_of_equivalence: "caution",
  missing_activity_report: "evidence_missing",
  unmapped_microsoft_sku: "evidence_partial",
  active_users_exceed_entitlement: "evidence_conflicting",
  stale_activity_report: "evidence_stale"
};

export function classifyEvidenceWarning(code: string): EvidenceWarningClass {
  return WARNING_CLASS_BY_CODE[code] ?? "informational";
}

export function warningCanConflictEvidence(code: string) {
  return ["evidence_conflicting", "blocking"].includes(classifyEvidenceWarning(code));
}

export function summarizeEvidenceWarnings(codes: readonly string[]) {
  const classes = codes.map(classifyEvidenceWarning);
  return {
    classes,
    hasConflict: classes.some((value) => value === "evidence_conflicting" || value === "blocking"),
    hasMissing: classes.includes("evidence_missing"),
    hasStale: classes.includes("evidence_stale"),
    hasPartial: classes.includes("evidence_partial")
  };
}
