import type { ConfidenceBreakdown } from "@/lib/commercial/ops-metrics";

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function calculateConfidenceScore(input: {
  sourceCoverage: number;
  freshnessScore: number;
  automatedEvidenceCoverage: number;
  metricCompleteness: number;
  stalePenalty?: number;
  missingPenalty?: number;
}) {
  const base =
    clampScore(input.sourceCoverage) * 0.3 +
    clampScore(input.freshnessScore) * 0.25 +
    clampScore(input.automatedEvidenceCoverage) * 0.25 +
    clampScore(input.metricCompleteness) * 0.2;

  const penalties = clampScore(input.stalePenalty ?? 0) * 0.5 + clampScore(input.missingPenalty ?? 0) * 0.5;
  return Math.round(Math.min(100, Math.max(0, base - penalties)));
}

export function buildConfidenceBreakdown(input: {
  sourceCoverage: number;
  freshnessScore: number;
  automatedEvidenceCoverage: number;
  metricCompleteness: number;
  stalePenalty?: number;
  missingPenalty?: number;
}): ConfidenceBreakdown {
  return {
    score: calculateConfidenceScore(input),
    sourceCoverage: clampScore(input.sourceCoverage),
    freshnessScore: clampScore(input.freshnessScore),
    automatedEvidenceCoverage: clampScore(input.automatedEvidenceCoverage),
    metricCompleteness: clampScore(input.metricCompleteness),
    stalePenalty: clampScore(input.stalePenalty ?? 0),
    missingPenalty: clampScore(input.missingPenalty ?? 0)
  };
}
