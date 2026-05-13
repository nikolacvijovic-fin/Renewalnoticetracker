export type EvidenceSourceType =
  | "runtime"
  | "derived"
  | "test_evidence"
  | "config"
  | "partial"
  | "unavailable";

export type ScoreStatus = "healthy" | "watch" | "risk" | "critical" | "unknown";

export type ReadinessKey =
  | "authz_tenant"
  | "testing_release"
  | "reliability"
  | "billing"
  | "admin_internal"
  | "privacy_compliance"
  | "observability_incident"
  | "analytics_quality";

export type CapacityKey =
  | "cron_pressure"
  | "retry_backlog"
  | "reminder_failure_pressure"
  | "webhook_pressure"
  | "import_queue_pressure"
  | "db_pressure"
  | "error_budget_pressure"
  | "support_overload";

export type ReadinessBand =
  | "fragile"
  | "serious prototype"
  | "controlled beta / serious pilot"
  | "strong production candidate"
  | "boring production";

export type CapacityBand = "comfortable" | "busy" | "warning" | "hot";

export type ScoreSubsection<K extends string> = {
  key: K;
  label: string;
  score: number;
  status: ScoreStatus;
  rationale: string;
  freshnessTimestamp: string | null;
  evidenceSourceType: EvidenceSourceType;
  blockers: string[];
  warnings: string[];
};

export type ConfidenceBreakdown = {
  score: number;
  sourceCoverage: number;
  freshnessScore: number;
  automatedEvidenceCoverage: number;
  metricCompleteness: number;
  stalePenalty: number;
  missingPenalty: number;
};

export type ScoreSummary<K extends string, B extends string> = {
  overallScore: number;
  confidenceScore: number;
  band: B;
  confidence: ConfidenceBreakdown;
  calculatedAt: string;
  trend: {
    previousScore: number | null;
    delta: number | null;
  };
  blockers: string[];
  pressureSources: string[];
  subscores: Array<ScoreSubsection<K>>;
  snapshotVersion: string;
};

export type MetricAlertRecord = {
  id: string;
  organization_id: string | null;
  metric_key: string;
  severity: string;
  status: string;
  opened_at: string;
  closed_at: string | null;
  evidence_json: Record<string, unknown>;
};

export const READINESS_SNAPSHOT_VERSION = "2026-04-19.v1";
export const CAPACITY_SNAPSHOT_VERSION = "2026-04-19.v1";
