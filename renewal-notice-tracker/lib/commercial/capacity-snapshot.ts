import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { calculateOverallCapacity } from "@/lib/commercial/capacity-formulas";
import { getCapacityBand } from "@/lib/commercial/capacity-thresholds";
import {
  buildAlertPayload,
  buildSubscore,
  calculateCoverage,
  calculateMetricCompleteness,
  createSummary,
  freshnessScoreFromTimestamp
} from "@/lib/commercial/metric-evidence";
import { buildConfidenceBreakdown } from "@/lib/commercial/score-confidence";
import {
  CAPACITY_SNAPSHOT_VERSION,
  type CapacityKey,
  type ScoreSubsection,
  type ScoreSummary
} from "@/lib/commercial/ops-metrics";

type CapacitySummary = ScoreSummary<CapacityKey, ReturnType<typeof getCapacityBand>>;

function applySnapshotScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
  query: T,
  organizationId?: string | null
) {
  return organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
}

function getSubscoreScore(subscores: Array<ScoreSubsection<CapacityKey>>, key: CapacityKey) {
  return subscores.find((item) => item.key === key)?.score ?? 0;
}

function scoreByPressure(value: number, ideal: number, danger: number) {
  if (value <= ideal) return 18;
  if (value >= danger) return 95;
  return Math.round(18 + ((value - ideal) / (danger - ideal)) * 77);
}

export async function buildCapacitySnapshotSummary(organizationId?: string | null): Promise<CapacitySummary> {
  const admin = createAdminSupabaseClient();
  const scopeFilter = organizationId ? { organization_id: organizationId } : null;
  const now = new Date().toISOString();
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [retryResult, failureResult, webhookResult, importJobsResult, processingErrorsResult, notificationsResult, previousSnapshotResult] =
    await Promise.all([
      admin
        .from("reminders")
        .select("id, next_retry_at, last_attempt_at, status")
        .match(scopeFilter ?? {})
        .eq("status", "retry_pending"),
      admin
        .from("reminders")
        .select("id, status, last_attempt_at")
        .match(scopeFilter ?? {})
        .eq("status", "failed_terminal"),
      admin
        .from("billing_webhook_events")
        .select("id, status, received_at, processed_at")
        .gte("received_at", last24h),
      admin
        .from("import_jobs")
        .select("id, status, created_at, row_count, imported_count")
        .match(scopeFilter ?? {})
        .in("status", ["pending", "failed", "completed_with_errors"]),
      admin
        .from("processing_errors")
        .select("id, stage, created_at")
        .match(scopeFilter ?? {})
        .gte("created_at", last24h),
      admin
        .from("notification_logs")
        .select("id, status, sent_at")
        .match(scopeFilter ?? {})
        .gte("sent_at", last24h),
      applySnapshotScope(
        admin.from("capacity_snapshots").select("overall_capacity_percent"),
        organizationId
      )
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

  const retryRows = (retryResult.data ?? []) as Array<{ next_retry_at: string | null; last_attempt_at: string | null }>;
  const failedReminderRows = (failureResult.data ?? []) as Array<{ last_attempt_at: string | null }>;
  const webhookRows = (webhookResult.data ?? []) as Array<{ status: string; received_at: string; processed_at: string | null }>;
  const importRows = (importJobsResult.data ?? []) as Array<{ status: string; row_count: number; created_at: string }>;
  const processingErrors = (processingErrorsResult.data ?? []) as Array<{ stage: string; created_at: string }>;
  const notifications = (notificationsResult.data ?? []) as Array<{ status: string }>;
  const previousScore = previousSnapshotResult.data?.overall_capacity_percent
    ? Number(previousSnapshotResult.data.overall_capacity_percent)
    : null;

  const oldestRetryAgeHours = retryRows.reduce((max, item) => {
    if (!item.next_retry_at) return max;
    const hours = (Date.now() - new Date(item.next_retry_at).getTime()) / (1000 * 60 * 60);
    return Math.max(max, hours);
  }, 0);

  const failedNotificationCount = notifications.filter((item) => item.status === "failed").length;
  const duplicateSuppressionMissing = 1;

  const subscores: Array<ScoreSubsection<CapacityKey>> = [
    buildSubscore({
      key: "cron_pressure",
      label: "Cron pressure",
      score: scoreByPressure(retryRows.length + failedReminderRows.length, 2, 20),
      rationale: "Derived from retrying and failed reminders acting as a proxy for cron strain and missed control-plane recovery.",
      freshnessTimestamp: now,
      evidenceSourceType: retryRows.length + failedReminderRows.length > 0 ? "runtime" : "partial",
      warnings: ["Explicit cron run telemetry is not yet stored, so this uses retry/failure pressure as a proxy."]
    }),
    buildSubscore({
      key: "retry_backlog",
      label: "Retry backlog",
      score: scoreByPressure(retryRows.length + oldestRetryAgeHours, 1, 18),
      rationale: "Retry pressure uses pending retries plus oldest retry age.",
      freshnessTimestamp: now,
      evidenceSourceType: "runtime",
      blockers: oldestRetryAgeHours > 6 ? ["Old retries are aging beyond six hours."] : [],
      warnings: retryRows.length === 0 ? ["No retries are pending, but average retry age telemetry is still partial."] : []
    }),
    buildSubscore({
      key: "reminder_failure_pressure",
      label: "Reminder failure pressure",
      score: scoreByPressure(failedReminderRows.length + failedNotificationCount + duplicateSuppressionMissing, 1, 15),
      rationale: "Reminder pressure combines failed reminders, failed notifications, and a missing duplicate-suppression telemetry penalty.",
      freshnessTimestamp: now,
      evidenceSourceType: "partial",
      blockers: failedReminderRows.length > 0 ? ["Terminal reminder failures are present."] : [],
      warnings: ["Duplicate-suppression telemetry is not yet explicit, so a conservative penalty is applied."]
    }),
    buildSubscore({
      key: "webhook_pressure",
      label: "Webhook pressure",
      score: scoreByPressure(webhookRows.filter((item) => item.status !== "processed").length, 0, 8),
      rationale: "Webhook pressure uses non-processed ledger rows and replay/out-of-order noise.",
      freshnessTimestamp: webhookRows[0]?.received_at ?? now,
      evidenceSourceType: "runtime",
      blockers: webhookRows.some((item) => item.status === "received") ? ["Unprocessed webhook ledger rows are present."] : [],
      warnings: []
    }),
    buildSubscore({
      key: "import_queue_pressure",
      label: "Import queue pressure",
      score: scoreByPressure(importRows.filter((row) => row.status === "pending").length + importRows.filter((row) => row.row_count > 500).length, 0, 10),
      rationale: "Import queue pressure uses pending jobs plus large-file pressure.",
      freshnessTimestamp: importRows[0]?.created_at ?? now,
      evidenceSourceType: importRows.length > 0 ? "runtime" : "partial",
      warnings: importRows.length === 0 ? ["No import queue telemetry is active right now."] : []
    }),
    buildSubscore({
      key: "db_pressure",
      label: "DB pressure",
      score: scoreByPressure(processingErrors.length, 0, 12),
      rationale: "Database pressure uses query/processing failure proxies because p95/p99 latency telemetry is not yet stored.",
      freshnessTimestamp: processingErrors[0]?.created_at ?? now,
      evidenceSourceType: "partial",
      blockers: [],
      warnings: ["Latency telemetry is missing, so this uses failure heuristics only."]
    }),
    buildSubscore({
      key: "error_budget_pressure",
      label: "Error budget pressure",
      score: scoreByPressure(processingErrors.length + failedNotificationCount, 1, 18),
      rationale: "Error budget pressure uses recent processing and notification failures as a route-failure proxy.",
      freshnessTimestamp: processingErrors[0]?.created_at ?? now,
      evidenceSourceType: "partial",
      warnings: ["Route-level 5xx telemetry is not yet captured directly."]
    }),
    buildSubscore({
      key: "support_overload",
      label: "Support overload",
      score: 42,
      rationale: "Support and onboarding time logs do not exist yet, so this stays conservative with low confidence.",
      freshnessTimestamp: null,
      evidenceSourceType: "unavailable",
      blockers: ["Support burden telemetry is not instrumented yet."],
      warnings: []
    })
  ];

  const confidence = buildConfidenceBreakdown({
    sourceCoverage: calculateCoverage(subscores),
    freshnessScore: freshnessScoreFromTimestamp(now, { strongHours: 1, weakHours: 12 }),
    automatedEvidenceCoverage: 58,
    metricCompleteness: calculateMetricCompleteness(subscores),
    stalePenalty: oldestRetryAgeHours > 6 ? 10 : 0,
    missingPenalty: subscores.filter((item) => item.evidenceSourceType === "unavailable").length * 10
  });

  const overallScore = calculateOverallCapacity({
    cronPressure: getSubscoreScore(subscores, "cron_pressure"),
    retryBacklog: getSubscoreScore(subscores, "retry_backlog"),
    reminderFailurePressure: getSubscoreScore(subscores, "reminder_failure_pressure"),
    webhookPressure: getSubscoreScore(subscores, "webhook_pressure"),
    importQueuePressure: getSubscoreScore(subscores, "import_queue_pressure"),
    dbPressure: getSubscoreScore(subscores, "db_pressure"),
    errorBudgetPressure: getSubscoreScore(subscores, "error_budget_pressure"),
    supportOverload: getSubscoreScore(subscores, "support_overload")
  });

  return createSummary({
    overallScore,
    band: getCapacityBand(overallScore),
    confidence,
    calculatedAt: now,
    previousScore,
    subscores,
    snapshotVersion: CAPACITY_SNAPSHOT_VERSION
  });
}

export async function persistCapacitySnapshot(
  organizationId?: string | null,
  metadata?: { jobKey?: string | null }
) {
  const admin = createAdminSupabaseClient();
  const summary = await buildCapacitySnapshotSummary(organizationId);
  const detailsJson = {
    job_key: metadata?.jobKey ?? null,
    blockers: summary.blockers,
    pressureSources: summary.pressureSources,
    confidence: summary.confidence,
    subscores: summary.subscores
  };

  const { data, error } = await admin
    .from("capacity_snapshots")
    .insert({
      organization_id: organizationId ?? null,
      overall_capacity_percent: summary.overallScore,
      confidence_score: summary.confidenceScore,
      cron_pressure_score: getSubscoreScore(summary.subscores, "cron_pressure"),
      retry_backlog_score: getSubscoreScore(summary.subscores, "retry_backlog"),
      reminder_failure_pressure_score: getSubscoreScore(summary.subscores, "reminder_failure_pressure"),
      webhook_pressure_score: getSubscoreScore(summary.subscores, "webhook_pressure"),
      import_queue_pressure_score: getSubscoreScore(summary.subscores, "import_queue_pressure"),
      db_pressure_score: getSubscoreScore(summary.subscores, "db_pressure"),
      error_budget_pressure_score: getSubscoreScore(summary.subscores, "error_budget_pressure"),
      support_overload_score: getSubscoreScore(summary.subscores, "support_overload"),
      snapshot_version: summary.snapshotVersion,
      details_json: detailsJson
    })
    .select("*")
    .single();

  if (error) throw error;
  return { snapshot: data, summary };
}

export function buildCapacityAlerts(summary: CapacitySummary) {
  const alerts = [];
  if (summary.overallScore >= 70) {
    alerts.push(
      buildAlertPayload({
        metricKey: "capacity_overall",
        score: summary.overallScore,
        status: summary.overallScore >= 85 ? "critical" : "risk",
        band: summary.band,
        blockers: summary.blockers,
        warnings: summary.pressureSources,
        confidenceScore: summary.confidenceScore
      })
    );
  }

  for (const subscore of summary.subscores) {
    if (subscore.status === "critical" || subscore.status === "risk") {
      alerts.push(
        buildAlertPayload({
          metricKey: subscore.key,
          score: subscore.score,
          status: subscore.status,
          band: null,
          blockers: subscore.blockers,
          warnings: subscore.warnings,
          confidenceScore: summary.confidenceScore
        })
      );
    }
  }

  return alerts;
}
