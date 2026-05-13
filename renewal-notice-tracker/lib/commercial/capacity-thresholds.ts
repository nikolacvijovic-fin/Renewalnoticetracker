import type { CapacityBand, ScoreStatus } from "@/lib/commercial/ops-metrics";

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getCapacityBand(score: number): CapacityBand {
  const normalized = clampScore(score);
  if (normalized <= 49) return "comfortable";
  if (normalized <= 69) return "busy";
  if (normalized <= 84) return "warning";
  return "hot";
}

export function getCapacityStatus(score: number): ScoreStatus {
  const normalized = clampScore(score);
  if (normalized <= 49) return "healthy";
  if (normalized <= 69) return "watch";
  if (normalized <= 84) return "risk";
  return "critical";
}
