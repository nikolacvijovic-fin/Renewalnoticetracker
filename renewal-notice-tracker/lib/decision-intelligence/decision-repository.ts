import {
  createDecisionRecord,
  decisionDedupeKey,
  decisionSourceFingerprint
} from "@/lib/decision-intelligence/decision-records";
import type { DecisionCandidate, DecisionRecord } from "@/lib/decision-intelligence/decision-types";

export type DecisionRepositoryApplyResult = {
  opened: DecisionRecord[];
  unchanged: DecisionRecord[];
  superseded: DecisionRecord[];
  records: DecisionRecord[];
};

export function applyDecisionCandidates(input: {
  existing: DecisionRecord[];
  candidates: DecisionCandidate[];
  now?: string;
}): DecisionRepositoryApplyResult {
  const now = input.now ?? new Date().toISOString();
  const records = [...input.existing];
  const opened: DecisionRecord[] = [];
  const unchanged: DecisionRecord[] = [];
  const superseded: DecisionRecord[] = [];

  for (const candidate of input.candidates) {
    const key = decisionDedupeKey(candidate);
    const nextFingerprint = candidate.sourceFingerprint ?? decisionSourceFingerprint(candidate);
    const active = records.find((record) =>
      decisionDedupeKey(record) === key &&
      !["resolved", "dismissed", "accepted_risk", "superseded"].includes(record.status)
    );

    if (active && active.metadata.sourceFingerprint === nextFingerprint) {
      unchanged.push(active);
      continue;
    }

    const next = createDecisionRecord({ ...candidate, sourceFingerprint: nextFingerprint }, now);
    if (active) {
      active.status = "superseded";
      active.updatedAt = now;
      active.resolvedAt = now;
      active.supersededByDecisionId = next.id;
      superseded.push(active);
    }
    records.push(next);
    opened.push(next);
  }

  return { opened, unchanged, superseded, records };
}
