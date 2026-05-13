import type {
  CapacityBand,
  CapacityKey,
  ConfidenceBreakdown,
  ReadinessBand,
  ReadinessKey,
  ScoreStatus,
  ScoreSubsection,
  ScoreSummary
} from "@/lib/commercial/ops-metrics";

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function freshnessScoreFromTimestamp(timestamp: string | null | undefined, windows: {
  strongHours: number;
  weakHours: number;
}) {
  if (!timestamp) return 15;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= windows.strongHours) return 100;
  if (ageHours <= windows.weakHours) {
    return clampScore(100 - ((ageHours - windows.strongHours) / (windows.weakHours - windows.strongHours)) * 50);
  }
  return 35;
}

export function statusFromScore(score: number): ScoreStatus {
  const normalized = clampScore(score);
  if (normalized >= 80) return "healthy";
  if (normalized >= 60) return "watch";
  if (normalized >= 40) return "risk";
  if (normalized > 0) return "critical";
  return "unknown";
}

export function buildSubscore<K extends string>(input: {
  key: K;
  label: string;
  score: number;
  rationale: string;
  freshnessTimestamp: string | null;
  evidenceSourceType: ScoreSubsection<K>["evidenceSourceType"];
  blockers?: string[];
  warnings?: string[];
}): ScoreSubsection<K> {
  return {
    key: input.key,
    label: input.label,
    score: clampScore(input.score),
    status: statusFromScore(input.score),
    rationale: input.rationale,
    freshnessTimestamp: input.freshnessTimestamp,
    evidenceSourceType: input.evidenceSourceType,
    blockers: input.blockers ?? [],
    warnings: input.warnings ?? []
  };
}

export function calculateCoverage(subscores: Array<{ evidenceSourceType: string }>) {
  if (subscores.length === 0) return 0;
  const covered = subscores.filter((item) => item.evidenceSourceType !== "unavailable").length;
  return clampScore((covered / subscores.length) * 100);
}

export function calculateMetricCompleteness(subscores: Array<{ blockers: string[]; warnings: string[] }>) {
  if (subscores.length === 0) return 0;
  const penalty = subscores.reduce((sum, item) => sum + item.blockers.length * 10 + item.warnings.length * 4, 0);
  return clampScore(100 - penalty / subscores.length);
}

export function extractBlockers(subscores: Array<{ label: string; blockers: string[] }>) {
  return subscores.flatMap((subscore) => subscore.blockers.map((blocker) => `${subscore.label}: ${blocker}`));
}

export function extractPressureSources(subscores: Array<{ label: string; warnings: string[]; blockers: string[] }>) {
  return subscores
    .flatMap((subscore) => [...subscore.blockers, ...subscore.warnings].map((item) => `${subscore.label}: ${item}`))
    .slice(0, 8);
}

export function buildTrend(currentScore: number, previousScore: number | null) {
  if (previousScore === null || previousScore === undefined) {
    return { previousScore: null, delta: null };
  }

  return {
    previousScore,
    delta: Math.round(currentScore - previousScore)
  };
}

export function createSummary<K extends string, B extends string>(input: {
  overallScore: number;
  band: B;
  confidence: ConfidenceBreakdown;
  calculatedAt: string;
  previousScore: number | null;
  subscores: Array<ScoreSubsection<K>>;
  snapshotVersion: string;
}): ScoreSummary<K, B> {
  return {
    overallScore: clampScore(input.overallScore),
    confidenceScore: input.confidence.score,
    band: input.band,
    confidence: input.confidence,
    calculatedAt: input.calculatedAt,
    trend: buildTrend(input.overallScore, input.previousScore),
    blockers: extractBlockers(input.subscores),
    pressureSources: extractPressureSources(input.subscores),
    subscores: input.subscores,
    snapshotVersion: input.snapshotVersion
  };
}

export function buildAlertPayload(input: {
  metricKey: ReadinessKey | CapacityKey | "readiness_overall" | "capacity_overall";
  score: number;
  status: ScoreStatus;
  band: ReadinessBand | CapacityBand | null;
  blockers?: string[];
  warnings?: string[];
  confidenceScore: number;
}) {
  return {
    metric_key: input.metricKey,
    severity:
      input.status === "critical" ? "critical" : input.status === "risk" ? "high" : input.status === "watch" ? "medium" : "low",
    evidence_json: {
      score: input.score,
      status: input.status,
      band: input.band,
      blockers: input.blockers ?? [],
      warnings: input.warnings ?? [],
      confidence_score: input.confidenceScore
    }
  };
}
