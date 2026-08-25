export type FounderEvidenceReadinessSummary = {
  averageReadinessScore: number | null;
  blockedContractCount: number;
  commonMissingEvidence: Array<{ category: string; count: number }>;
  staleProviderConnectionCount: number;
  unreviewedExtractionBacklogCount: number;
  approachingDeadlineWithoutReadyEvidenceCount: number;
  averageUploadToDecisionReadyHours: number | null;
};

export function buildFounderEvidenceReadinessSummary(input: {
  assessments: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  contracts: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
  files: Array<Record<string, unknown>>;
  now?: string;
}): FounderEvidenceReadinessSummary {
  const now = new Date(input.now ?? new Date().toISOString());
  const latestAssessmentByContract = new Map<string, Record<string, unknown>>();
  for (const assessment of [...input.assessments].sort((left, right) =>
    new Date(String(right.calculated_at ?? 0)).valueOf() - new Date(String(left.calculated_at ?? 0)).valueOf()
  )) {
    const contractId = String(assessment.contract_id);
    if (!latestAssessmentByContract.has(contractId)) latestAssessmentByContract.set(contractId, assessment);
  }
  const currentAssessments = [...latestAssessmentByContract.values()];
  const scores = currentAssessments.map((row) => Number(row.score)).filter(Number.isFinite);
  const missingByCategory = new Map<string, number>();
  for (const assessment of currentAssessments) {
    const items = Array.isArray(assessment.evidence_readiness_items)
      ? assessment.evidence_readiness_items as Array<Record<string, unknown>>
      : [];
    for (const item of items) {
      if (!["missing", "stale", "conflicting", "insufficient"].includes(String(item.state))) continue;
      const category = String(item.category);
      missingByCategory.set(category, (missingByCategory.get(category) ?? 0) + 1);
    }
  }
  const assessmentByContract = latestAssessmentByContract;
  const approaching = input.contracts.filter((contract) => {
    const metadata = Array.isArray(contract.contract_metadata)
      ? contract.contract_metadata[0] as Record<string, unknown> | undefined
      : contract.contract_metadata as Record<string, unknown> | null;
    const deadline = typeof metadata?.notice_deadline_date === "string" ? new Date(`${metadata.notice_deadline_date}T00:00:00.000Z`) : null;
    if (!deadline || !Number.isFinite(deadline.valueOf())) return false;
    const days = (deadline.valueOf() - now.valueOf()) / 86_400_000;
    return days >= 0 && days <= 30 && assessmentByContract.get(String(contract.id))?.readiness_state !== "decision_ready";
  }).length;
  const firstFileByContract = new Map<string, number>();
  for (const file of input.files) {
    const timestamp = new Date(String(file.uploaded_at)).valueOf();
    const contractId = String(file.contract_id);
    if (Number.isFinite(timestamp) && timestamp < (firstFileByContract.get(contractId) ?? Number.POSITIVE_INFINITY)) {
      firstFileByContract.set(contractId, timestamp);
    }
  }
  const firstReadyByContract = new Map<string, number>();
  for (const row of input.history.filter((entry) => entry.readiness_state === "decision_ready")) {
    const contractId = String(row.contract_id);
    const readyAt = new Date(String(row.calculated_at)).valueOf();
    if (Number.isFinite(readyAt) && readyAt < (firstReadyByContract.get(contractId) ?? Number.POSITIVE_INFINITY)) {
      firstReadyByContract.set(contractId, readyAt);
    }
  }
  const readinessDurations = [...firstReadyByContract.entries()].map(([contractId, readyAt]) => {
    const uploadedAt = firstFileByContract.get(contractId);
    return uploadedAt !== undefined && readyAt >= uploadedAt ? (readyAt - uploadedAt) / 3_600_000 : Number.NaN;
  }).filter(Number.isFinite);

  return {
    averageReadinessScore: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    blockedContractCount: currentAssessments.filter((row) => row.readiness_state === "blocked").length,
    commonMissingEvidence: [...missingByCategory.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
      .slice(0, 5),
    staleProviderConnectionCount: input.connections.filter((row) => {
      if (row.status !== "connected") return true;
      const lastSync = row.last_successful_sync_at ? new Date(String(row.last_successful_sync_at)).valueOf() : Number.NaN;
      return !Number.isFinite(lastSync) || (now.valueOf() - lastSync) / 86_400_000 > 7;
    }).length,
    unreviewedExtractionBacklogCount: input.contracts.filter((contract) => {
      const metadata = Array.isArray(contract.contract_metadata)
        ? contract.contract_metadata[0] as Record<string, unknown> | undefined
        : contract.contract_metadata as Record<string, unknown> | null;
      return !metadata?.reviewed_at || metadata.needs_review === true || metadata.has_weak_evidence === true;
    }).length,
    approachingDeadlineWithoutReadyEvidenceCount: approaching,
    averageUploadToDecisionReadyHours: readinessDurations.length
      ? Math.round(readinessDurations.reduce((sum, hours) => sum + hours, 0) / readinessDurations.length)
      : null
  };
}
