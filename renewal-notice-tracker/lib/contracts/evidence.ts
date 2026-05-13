export type EvidenceRow = {
  field_name: string;
  snippet: string;
  confidence: number | null;
  source: string;
};

export function buildEvidenceRows(
  fieldSourceSnippets: Record<string, string>,
  fieldConfidence: Record<string, number>,
  source = "extraction"
) {
  return Object.entries(fieldSourceSnippets)
    .map(([fieldName, snippet]) => ({
      field_name: fieldName,
      snippet: snippet.trim(),
      confidence: typeof fieldConfidence[fieldName] === "number" ? fieldConfidence[fieldName] : null,
      source
    }))
    .filter((row) => row.snippet.length > 0);
}
