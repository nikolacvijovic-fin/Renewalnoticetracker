import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { calculateOverallReadiness } from "@/lib/commercial/readiness-formulas";
import { buildConfidenceBreakdown } from "@/lib/commercial/score-confidence";
import { getReadinessBand } from "@/lib/commercial/readiness-thresholds";
import {
  buildAlertPayload,
  buildSubscore,
  calculateCoverage,
  calculateMetricCompleteness,
  createSummary,
  freshnessScoreFromTimestamp
} from "@/lib/commercial/metric-evidence";
import {
  READINESS_SNAPSHOT_VERSION,
  type MetricAlertRecord,
  type ReadinessKey,
  type ScoreSubsection,
  type ScoreSummary
} from "@/lib/commercial/ops-metrics";
import { calculatePrivacyOperationsSnapshot } from "@/lib/commercial/privacy-operations";

type ReadinessSummary = ScoreSummary<ReadinessKey, ReturnType<typeof getReadinessBand>>;

function applySnapshotScope<T extends { eq: (column: string, value: string) => T; is: (column: string, value: null) => T }>(
  query: T,
  organizationId?: string | null
) {
  return organizationId ? query.eq("organization_id", organizationId) : query.is("organization_id", null);
}

function getSubscoreScore(subscores: Array<ScoreSubsection<ReadinessKey>>, key: ReadinessKey) {
  return subscores.find((item) => item.key === key)?.score ?? 0;
}

export async function buildReadinessSnapshotSummary(organizationId?: string | null): Promise<ReadinessSummary> {
  const admin = createAdminSupabaseClient();
  const scopeFilter = organizationId ? { organization_id: organizationId } : null;
  const now = new Date().toISOString();
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [openAlertsResult, processingErrorsResult, notificationFailuresResult, webhookFailuresResult, reminderFailuresResult, reviewBacklogResult, exportRequestsResult, deletionRequestsResult, backupCheckResult, previousSnapshotResult] =
    await Promise.all([
      admin
        .from("metric_alerts")
        .select("id, metric_key, severity, status, opened_at, closed_at, evidence_json")
        .eq("status", "open")
        .match(scopeFilter ?? {})
        .order("opened_at", { ascending: false }),
      admin
        .from("processing_errors")
        .select("id, stage, created_at", { count: "exact" })
        .match(scopeFilter ?? {})
        .gte("created_at", last7d),
      admin
        .from("notification_logs")
        .select("id, status, sent_at", { count: "exact" })
        .match(scopeFilter ?? {})
        .eq("status", "failed")
        .gte("sent_at", last7d),
      admin
        .from("billing_webhook_events")
        .select("id, status, processed_at, received_at", { count: "exact" })
        .gte("received_at", last7d),
      admin
        .from("reminders")
        .select("id, status, last_attempt_at, next_retry_at", { count: "exact" })
        .match(scopeFilter ?? {})
        .in("status", ["failed_terminal", "retry_pending"]),
      admin
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .match(scopeFilter ?? {})
        .eq("status", "needs_review"),
      admin
        .from("data_export_requests")
        .select("requested_at", { count: "exact" })
        .match(scopeFilter ?? {})
        .gte("requested_at", last30d),
      admin
        .from("deletion_requests")
        .select("requested_at, status")
        .match(scopeFilter ?? {})
        .order("requested_at", { ascending: false }),
      admin
        .from("backup_readiness_checks")
        .select("checked_at, status, restore_tested_at, evidence_json")
        .eq("environment", "production")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      applySnapshotScope(
        admin.from("readiness_snapshots").select("overall_score"),
        organizationId
      )
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

  const alerts = (openAlertsResult.data ?? []) as MetricAlertRecord[];
  const processingErrorsCount = processingErrorsResult.count ?? 0;
  const notificationFailuresCount = notificationFailuresResult.count ?? 0;
  const webhookFailureCount =
    ((webhookFailuresResult.data ?? []) as Array<{ status: string }>).filter((item) => item.status !== "processed").length;
  const reminderFailureCount = reminderFailuresResult.count ?? 0;
  const reviewBacklogCount = reviewBacklogResult.count ?? 0;
  const privacyOperations = calculatePrivacyOperationsSnapshot({
    exportRequests30d: exportRequestsResult.count ?? 0,
    openDeletionRequests: (deletionRequestsResult.data ?? []).filter((row) => row.status !== "completed").length,
    latestExportAt: exportRequestsResult.data?.[0]?.requested_at ?? null,
    latestDeletionRequestAt: deletionRequestsResult.data?.[0]?.requested_at ?? null,
    latestBackupCheckAt: backupCheckResult.data?.checked_at ?? null,
    latestBackupStatus: backupCheckResult.data?.status ?? null,
    latestRestoreTestedAt: backupCheckResult.data?.restore_tested_at ?? null
  });
  const latestRecoveryTimeMinutes = Number(
    ((backupCheckResult.data?.evidence_json ?? {}) as Record<string, unknown>).recovery_time_minutes ?? NaN
  );
  const previousScore = previousSnapshotResult.data?.overall_score
    ? Number(previousSnapshotResult.data.overall_score)
    : null;

  const tenantAlerts = alerts.filter((alert) => alert.metric_key.includes("tenant") || alert.metric_key.includes("permission"));
  const billingAlerts = alerts.filter((alert) => alert.metric_key.includes("billing") || alert.metric_key.includes("webhook"));
  const adminAlerts = alerts.filter((alert) => alert.metric_key.includes("admin") || alert.metric_key.includes("internal"));

  const subscores: Array<ScoreSubsection<ReadinessKey>> = [
    buildSubscore({
      key: "authz_tenant",
      label: "Authz + tenant",
      score: tenantAlerts.length > 0 ? 40 : 78,
      rationale:
        "Tenant isolation now has explicit org-scoped admin actions and active-org selection, but live tenant-boundary denial telemetry is still thin.",
      freshnessTimestamp: now,
      evidenceSourceType: "partial",
      blockers: tenantAlerts.length > 0 ? ["Open tenant or permission alerts exist."] : [],
      warnings: ["Runtime tenant-denial telemetry is still incomplete."]
    }),
    buildSubscore({
      key: "testing_release",
      label: "Testing + release",
      score: 68,
      rationale:
        "Named trust-sensitive CI gates exist, but staging smoke freshness and broad P0 E2E coverage are not yet encoded strongly enough in runtime evidence.",
      freshnessTimestamp: now,
      evidenceSourceType: "test_evidence",
      blockers: [],
      warnings: ["Release smoke freshness is not yet sourced from runtime telemetry."]
    }),
    buildSubscore({
      key: "reliability",
      label: "Reliability",
      score: Math.max(30, 85 - processingErrorsCount * 4 - notificationFailuresCount * 3 - reminderFailureCount * 4),
      rationale:
        "Derived from processing errors, failed notifications, and failed or retrying reminders. Missing duplicate-suppression telemetry lowers confidence.",
      freshnessTimestamp: now,
      evidenceSourceType: processingErrorsCount + notificationFailuresCount + reminderFailureCount > 0 ? "runtime" : "partial",
      blockers: reminderFailureCount > 0 ? ["Reminder failures or retry backlog present."] : [],
      warnings: processingErrorsCount > 0 ? ["Extraction or upload failures are still occurring."] : ["Duplicate-suppression telemetry is not yet stored explicitly."]
    }),
    buildSubscore({
      key: "billing",
      label: "Billing",
      score: Math.max(35, 82 - webhookFailureCount * 10 - billingAlerts.length * 12),
      rationale:
        "Billing readiness is based on webhook ledger health and open billing alerts. Direct downgrade-drift runtime telemetry is still partial.",
      freshnessTimestamp: now,
      evidenceSourceType: webhookFailuresResult.count ? "runtime" : "partial",
      blockers: billingAlerts.length > 0 ? ["Open billing or webhook alerts exist."] : [],
      warnings: webhookFailureCount === 0 ? ["No recent webhook failures, but downgrade drift telemetry is still partial."] : []
    }),
    buildSubscore({
      key: "admin_internal",
      label: "Admin + internal",
      score: adminAlerts.length > 0 ? 42 : 74,
      rationale:
        "Internal health moved to header-secret auth and admin debug data is redacted, but misuse telemetry and privileged surface coverage are still partial.",
      freshnessTimestamp: now,
      evidenceSourceType: "partial",
      blockers: adminAlerts.length > 0 ? ["Open admin/internal alerts exist."] : [],
      warnings: ["Privileged route coverage is improved but not yet comprehensive across all helpers."]
    }),
    buildSubscore({
      key: "privacy_compliance",
      label: "Privacy + compliance",
      score:
        privacyOperations.status === "healthy"
          ? 72
          : privacyOperations.status === "watch"
            ? 58
            : 42,
      rationale:
        "Privacy readiness now reflects export records, deletion request handling, and backup-readiness evidence. It stays conservative when restore drills or backup checks are missing.",
      freshnessTimestamp: privacyOperations.latestBackupCheckAt ?? privacyOperations.latestExportAt,
      evidenceSourceType: privacyOperations.latestBackupCheckAt ? "runtime" : "partial",
      blockers: privacyOperations.blockers,
      warnings: privacyOperations.warnings
    }),
    buildSubscore({
      key: "observability_incident",
      label: "Observability + incident",
      score: Math.max(
        25,
        (alerts.length === 0 ? 58 : 58 - alerts.length * 5) -
          (!Number.isFinite(latestRecoveryTimeMinutes) ? 6 : 0) -
          (Number.isFinite(latestRecoveryTimeMinutes) && latestRecoveryTimeMinutes > 120 ? 6 : 0)
      ),
      rationale:
        "Open alerts exist and are now part of runtime evidence, and restore drill timing can now contribute to recovery posture. MTTR and broader incident drill history are still incomplete.",
      freshnessTimestamp: alerts[0]?.opened_at ?? backupCheckResult.data?.restore_tested_at ?? now,
      evidenceSourceType:
        alerts.length > 0 || Number.isFinite(latestRecoveryTimeMinutes) ? "runtime" : "partial",
      blockers: [
        ...(alerts.filter((alert) => alert.severity === "critical").length > 0
          ? ["Critical alerts are open."]
          : []),
        ...(Number.isFinite(latestRecoveryTimeMinutes) && latestRecoveryTimeMinutes > 240
          ? ["Latest recovery timing evidence exceeds 240 minutes."]
          : [])
      ],
      warnings: [
        ...(!Number.isFinite(latestRecoveryTimeMinutes)
          ? ["Recovery timing telemetry is not yet recorded on restore drills."]
          : []),
        ...(Number.isFinite(latestRecoveryTimeMinutes) && latestRecoveryTimeMinutes > 120
          ? ["Latest recovery timing evidence is slower than the target threshold."]
          : [])
      ]
    }),
    buildSubscore({
      key: "analytics_quality",
      label: "Analytics quality",
      score: 34,
      rationale:
        "The analytics architecture exists, but event completeness, reconciliation, and freshness are not yet evidenced strongly enough in live tables.",
      freshnessTimestamp: null,
      evidenceSourceType: "unavailable",
      blockers: ["Analytics event completeness telemetry is still missing."],
      warnings: []
    })
  ];

  const confidence = buildConfidenceBreakdown({
    sourceCoverage: calculateCoverage(subscores),
    freshnessScore: freshnessScoreFromTimestamp(
      [openAlertsResult.data?.[0]?.opened_at, now].filter(Boolean)[0] ?? null,
      { strongHours: 6, weakHours: 48 }
    ),
    automatedEvidenceCoverage: 62,
    metricCompleteness: calculateMetricCompleteness(subscores),
    stalePenalty: reviewBacklogCount > 0 ? 8 : 0,
    missingPenalty:
      subscores.filter((item) => item.evidenceSourceType === "unavailable").length * 8 +
      subscores.filter((item) => item.evidenceSourceType === "partial").length * 4
  });

  const overallScore = calculateOverallReadiness({
    authzTenant: getSubscoreScore(subscores, "authz_tenant"),
    testingRelease: getSubscoreScore(subscores, "testing_release"),
    reliability: getSubscoreScore(subscores, "reliability"),
    billing: getSubscoreScore(subscores, "billing"),
    adminInternal: getSubscoreScore(subscores, "admin_internal"),
    privacyCompliance: getSubscoreScore(subscores, "privacy_compliance"),
    observabilityIncident: getSubscoreScore(subscores, "observability_incident"),
    analyticsQuality: getSubscoreScore(subscores, "analytics_quality")
  });

  return createSummary({
    overallScore,
    band: getReadinessBand(overallScore),
    confidence,
    calculatedAt: now,
    previousScore,
    subscores,
    snapshotVersion: READINESS_SNAPSHOT_VERSION
  });
}

export async function persistReadinessSnapshot(
  organizationId?: string | null,
  metadata?: { jobKey?: string | null }
) {
  const admin = createAdminSupabaseClient();
  const summary = await buildReadinessSnapshotSummary(organizationId);
  const detailsJson = {
    job_key: metadata?.jobKey ?? null,
    blockers: summary.blockers,
    pressureSources: summary.pressureSources,
    confidence: summary.confidence,
    subscores: summary.subscores
  };

  const { data, error } = await admin
    .from("readiness_snapshots")
    .insert({
      organization_id: organizationId ?? null,
      overall_score: summary.overallScore,
      confidence_score: summary.confidenceScore,
      authz_tenant_score: getSubscoreScore(summary.subscores, "authz_tenant"),
      testing_release_score: getSubscoreScore(summary.subscores, "testing_release"),
      reliability_score: getSubscoreScore(summary.subscores, "reliability"),
      billing_score: getSubscoreScore(summary.subscores, "billing"),
      admin_internal_score: getSubscoreScore(summary.subscores, "admin_internal"),
      privacy_compliance_score: getSubscoreScore(summary.subscores, "privacy_compliance"),
      observability_incident_score: getSubscoreScore(summary.subscores, "observability_incident"),
      analytics_quality_score: getSubscoreScore(summary.subscores, "analytics_quality"),
      blockers_count: summary.blockers.length,
      critical_blockers_count: summary.subscores.filter((item) => item.status === "critical").length,
      snapshot_version: summary.snapshotVersion,
      details_json: detailsJson
    })
    .select("*")
    .single();

  if (error) throw error;
  return { snapshot: data, summary };
}

export function buildReadinessAlerts(summary: ReadinessSummary) {
  const alerts = [];

  if (summary.overallScore <= 59 || summary.confidenceScore <= 49) {
    alerts.push(
      buildAlertPayload({
        metricKey: "readiness_overall",
        score: summary.overallScore,
        status: summary.overallScore <= 39 ? "critical" : "risk",
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
