import type { ReadinessBand, ScoreStatus } from "@/lib/commercial/ops-metrics";

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

export function getReadinessBand(score: number): ReadinessBand {
  const normalized = clampScore(score);
  if (normalized <= 39) return "fragile";
  if (normalized <= 59) return "serious prototype";
  if (normalized <= 74) return "controlled beta / serious pilot";
  if (normalized <= 89) return "strong production candidate";
  return "boring production";
}

export function getReadinessStatus(score: number): ScoreStatus {
  const normalized = clampScore(score);
  if (normalized <= 39) return "critical";
  if (normalized <= 59) return "risk";
  if (normalized <= 74) return "watch";
  return "healthy";
}
