import {
  createGovernedActionRecord,
  governedActionDedupeKey,
  governedActionSourceFingerprint
} from "@/lib/action-governance/action-records";
import type { GovernedActionCandidate, GovernedActionRecord } from "@/lib/action-governance/action-types";

const ACTIVE_STATUSES = new Set(["proposed", "blocked", "ready", "approved"]);

export function applyGovernedActionCandidates(input: {
  existing: GovernedActionRecord[];
  candidates: GovernedActionCandidate[];
  now?: string;
}): {
  records: GovernedActionRecord[];
  opened: GovernedActionRecord[];
  unchanged: GovernedActionRecord[];
  superseded: GovernedActionRecord[];
} {
  const now = input.now ?? new Date().toISOString();
  const records = [...input.existing];
  const opened: GovernedActionRecord[] = [];
  const unchanged: GovernedActionRecord[] = [];
  const superseded: GovernedActionRecord[] = [];

  for (const candidate of input.candidates) {
    const dedupeKey = governedActionDedupeKey(candidate);
    const fingerprint = candidate.sourceFingerprint ?? governedActionSourceFingerprint(candidate);
    const active = records.find((record) =>
      ACTIVE_STATUSES.has(record.status) &&
      governedActionDedupeKey(record) === dedupeKey
    );

    if (active && active.metadata.sourceFingerprint === fingerprint) {
      unchanged.push(active);
      continue;
    }

    const next = createGovernedActionRecord({ ...candidate, sourceFingerprint: fingerprint }, now);
    if (active) {
      const stale: GovernedActionRecord = {
        ...active,
        status: "superseded",
        supersededByActionId: next.id,
        updatedAt: now
      };
      const index = records.findIndex((record) => record.id === active.id);
      records[index] = stale;
      superseded.push(stale);
    }
    records.push(next);
    opened.push(next);
  }

  return { records, opened, unchanged, superseded };
}
