import type {
  ContractDocumentRelationship,
  ContractExtractedField
} from "@/lib/contract-intelligence/extraction-types";

export type CommercialFieldConflict = {
  fieldKey: string;
  candidates: ContractExtractedField[];
  status: "unresolved" | "human_resolved" | "supported_precedence";
  reasonCode:
    | "conflicting_document_values"
    | "accepted_candidate_selected"
    | "accepted_amendment_precedence";
  selectedCandidateId: string | null;
  supportingRelationshipIds: string[];
};

function comparableValue(field: ContractExtractedField) {
  return JSON.stringify(field.edited_value ?? field.normalized_value ?? field.extracted_value);
}

function isAcceptedPrecedenceRelationship(relationship: ContractDocumentRelationship) {
  const effectiveDate = relationship.effective_date;
  const parsedEffectiveDate = effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)
    ? new Date(`${effectiveDate}T00:00:00.000Z`)
    : null;
  const validDate = effectiveDate !== null
    && parsedEffectiveDate !== null
    && !Number.isNaN(parsedEffectiveDate.getTime())
    && parsedEffectiveDate.toISOString().slice(0, 10) === effectiveDate;
  return relationship.evidence_status === "accepted"
    && relationship.reviewed_by_user_id !== null
    && relationship.reviewed_at !== null
    && validDate
    && ["amends", "supersedes"].includes(relationship.relationship_type);
}

function resolveAcceptedRelationshipPrecedence(
  candidates: ContractExtractedField[],
  relationships: ContractDocumentRelationship[]
) {
  const acceptedCandidates = candidates.filter((candidate) => candidate.evidence_status === "accepted");
  const candidateFiles = new Set(
    acceptedCandidates.map((candidate) => candidate.source_file_id).filter((fileId): fileId is string => Boolean(fileId))
  );
  if (acceptedCandidates.length < 2 || candidateFiles.size !== acceptedCandidates.length) return null;

  const scopedRelationships = relationships.filter((relationship) =>
    isAcceptedPrecedenceRelationship(relationship)
    && candidateFiles.has(relationship.source_file_id)
    && candidateFiles.has(relationship.target_file_id)
    && acceptedCandidates.every((candidate) =>
      candidate.organization_id === relationship.organization_id
      && candidate.contract_id === relationship.contract_id
    )
  );
  const outgoing = new Map<string, ContractDocumentRelationship[]>();
  for (const relationship of scopedRelationships) {
    const entries = outgoing.get(relationship.source_file_id) ?? [];
    entries.push(relationship);
    outgoing.set(relationship.source_file_id, entries);
  }

  const reachable = (sourceFileId: string) => {
    const visited = new Set<string>();
    const relationshipIds = new Set<string>();
    const stack: Array<{ fileId: string; latestAllowedDate: string | null }> = [
      { fileId: sourceFileId, latestAllowedDate: null }
    ];
    let invalidChronology = false;
    while (stack.length) {
      const current = stack.pop()!;
      for (const relationship of outgoing.get(current.fileId) ?? []) {
        if (current.latestAllowedDate && relationship.effective_date! > current.latestAllowedDate) {
          invalidChronology = true;
          continue;
        }
        relationshipIds.add(relationship.id);
        if (!visited.has(relationship.target_file_id)) {
          visited.add(relationship.target_file_id);
          stack.push({
            fileId: relationship.target_file_id,
            latestAllowedDate: relationship.effective_date
          });
        }
      }
    }
    return { visited, relationshipIds, invalidChronology };
  };

  const winners = acceptedCandidates.flatMap((candidate) => {
    const fileId = candidate.source_file_id;
    if (!fileId) return [];
    const path = reachable(fileId);
    const governsEveryOtherCandidate = [...candidateFiles].every(
      (candidateFileId) => candidateFileId === fileId || path.visited.has(candidateFileId)
    );
    return governsEveryOtherCandidate && !path.invalidChronology
      ? [{ candidate, relationshipIds: [...path.relationshipIds] }]
      : [];
  });
  return winners.length === 1 ? winners[0] : null;
}

export function findCommercialFieldConflicts(
  fields: ContractExtractedField[],
  relationships: ContractDocumentRelationship[] = []
): CommercialFieldConflict[] {
  const byKey = new Map<string, ContractExtractedField[]>();
  for (const field of fields.filter((candidate) => candidate.evidence_status !== "rejected")) {
    const group = byKey.get(field.field_key) ?? [];
    group.push(field);
    byKey.set(field.field_key, group);
  }

  const conflicts: CommercialFieldConflict[] = [];
  for (const [fieldKey, candidates] of byKey) {
    const values = new Set(candidates.map(comparableValue));
    if (values.size < 2) continue;
    const accepted = candidates.filter((candidate) => candidate.evidence_status === "accepted");
    const precedence = resolveAcceptedRelationshipPrecedence(candidates, relationships);
    conflicts.push({
      fieldKey,
      candidates,
      status: accepted.length === 1
        ? "human_resolved"
        : precedence
          ? "supported_precedence"
          : "unresolved",
      reasonCode: accepted.length === 1
        ? "accepted_candidate_selected"
        : precedence
          ? "accepted_amendment_precedence"
          : "conflicting_document_values",
      selectedCandidateId: accepted.length === 1 ? accepted[0]!.id : precedence?.candidate.id ?? null,
      supportingRelationshipIds: precedence?.relationshipIds ?? []
    });
  }
  return conflicts;
}

export function selectEffectiveAcceptedField(input: {
  fields: ContractExtractedField[];
  fieldKey: string;
  relationships?: ContractDocumentRelationship[];
}) {
  const candidates = input.fields.filter(
    (field) => field.field_key === input.fieldKey && field.evidence_status === "accepted"
  );
  const values = new Set(candidates.map(comparableValue));
  if (values.size === 1) return candidates[0];
  const conflict = findCommercialFieldConflicts(input.fields, input.relationships ?? [])
    .find((entry) => entry.fieldKey === input.fieldKey);
  if (!conflict || conflict.status === "unresolved" || !conflict.selectedCandidateId) return undefined;
  return candidates.find((candidate) => candidate.id === conflict.selectedCandidateId);
}
