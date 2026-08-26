export type UsageEvidenceCandidate = {
  organizationId: string;
  contractId: string;
  matchId: string;
  matchConfidence: number;
  matchStatus?: string | null;
  matchResolvedAt?: string | null;
  matchSupersededAt?: string | null;
  usageRowId: string;
  usageRowOrganizationId: string;
  batchId: string;
  batchOrganizationId: string;
  batchStatus: string;
  provider: string | null;
  providerConnectionId: string | null;
  syncRunId: string | null;
  syncRunOrganizationId: string | null;
  syncRunStatus: string | null;
  syncCompletedAt: string | null;
  collectedAt: string | null;
  isSample: boolean;
  evidenceState: string | null;
  validationStatus: string | null;
  purchasedQuantityKnown: boolean;
  assignedQuantityKnown: boolean;
  warningCodes: string[];
  lineageValid: boolean;
};

export type UsageEvidenceProvenance = {
  provider: string;
  providerConnectionId: string;
  batchId: string;
  syncRunId: string;
  usageRowId: string;
  matchId: string;
  matchConfidence: number;
  collectedAt: string;
  syncCompletedAt: string;
  evidenceState: "verified" | "partial";
  purchasedQuantityKnown: boolean;
  assignedQuantityKnown: boolean;
  warningCodes: string[];
};

export type UsageEvidenceResolution =
  | { state: "verified"; provenance: UsageEvidenceProvenance }
  | { state: "missing" | "insufficient"; reason: string; provenance: null };

function belongsToScope(candidate: UsageEvidenceCandidate, organizationId: string, contractId: string) {
  return candidate.organizationId === organizationId
    && candidate.usageRowOrganizationId === organizationId
    && candidate.batchOrganizationId === organizationId
    && candidate.syncRunOrganizationId === organizationId
    && candidate.contractId === contractId;
}

function isEligible(candidate: UsageEvidenceCandidate, organizationId: string, contractId: string) {
  return belongsToScope(candidate, organizationId, contractId)
    && !candidate.isSample
    && candidate.validationStatus !== "rejected"
    && (!candidate.matchStatus || candidate.matchStatus === "active")
    && !candidate.matchResolvedAt
    && !candidate.matchSupersededAt
    && candidate.batchStatus === "completed"
    && candidate.syncRunStatus === "completed"
    && candidate.lineageValid
    && Boolean(candidate.provider && candidate.providerConnectionId && candidate.syncRunId)
    && Boolean(candidate.collectedAt && candidate.syncCompletedAt)
    && candidate.matchConfidence >= 0.8;
}

export function resolveContractUsageEvidence(input: {
  organizationId: string;
  contractId: string;
  candidates: UsageEvidenceCandidate[];
}): UsageEvidenceResolution {
  const inScope = input.candidates.filter((candidate) => belongsToScope(candidate, input.organizationId, input.contractId));
  const eligible = inScope.filter((candidate) => isEligible(candidate, input.organizationId, input.contractId));
  if (!eligible.length) {
    return {
      state: inScope.length ? "insufficient" : "missing",
      reason: inScope.length ? "No verified successful provider snapshot supports this contract match." : "No usage match supports this contract.",
      provenance: null
    };
  }
  if (eligible.length !== 1) {
    return {
      state: "insufficient",
      reason: "Several verified usage matches support this contract; review the contract mapping before relying on usage evidence.",
      provenance: null
    };
  }
  const candidate = eligible[0]!;
  return {
    state: "verified",
    provenance: {
      provider: candidate.provider!,
      providerConnectionId: candidate.providerConnectionId!,
      batchId: candidate.batchId,
      syncRunId: candidate.syncRunId!,
      usageRowId: candidate.usageRowId,
      matchId: candidate.matchId,
      matchConfidence: candidate.matchConfidence,
      collectedAt: candidate.collectedAt!,
      syncCompletedAt: candidate.syncCompletedAt!,
      evidenceState: candidate.evidenceState === "verified" ? "verified" : "partial",
      purchasedQuantityKnown: candidate.purchasedQuantityKnown,
      assignedQuantityKnown: candidate.assignedQuantityKnown,
      warningCodes: candidate.warningCodes.slice(0, 20)
    }
  };
}
