import { recordEnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-recorder";
import { enqueueBackgroundJob } from "@/lib/background-jobs/job-queue";
import { sanitizeQuoteEvidence } from "@/lib/quote-comparison/quote-normalization";
import { aggregateRevenueIntelligence } from "@/lib/revenue-intelligence/revenue-intelligence-aggregator";
import { generateExecutiveInsights } from "@/lib/revenue-intelligence/executive-insight-generator";
import { buildRevenueForecastScenarios } from "@/lib/revenue-intelligence/revenue-forecasting";
import { loadRevenueIntelligenceSourceData } from "@/lib/revenue-intelligence/revenue-intelligence-source-queries";
import type {
  CommercialImpactMetric,
  ExecutiveInsight,
  RevenueIntelligenceDashboard,
  RevenueIntelligenceEvidenceLink,
  RevenueRiskSignal
} from "@/lib/revenue-intelligence/revenue-types";
import {
  archiveRevenueRiskSignal,
  archiveStaleRevenueSignals,
  createOrUpdateCommercialImpactMetric,
  createOrUpdateExecutiveInsight,
  createOrUpdateRevenueEvidenceLink,
  createOrUpdateRevenueForecastScenario,
  createOrUpdateRevenueRiskSignal,
  createOrUpdateVendorCategorySummary,
  createRevenueIntelligenceSnapshot,
  getLatestRevenueIntelligenceSnapshot,
  listCommercialImpactMetrics,
  listExecutiveInsights,
  listRevenueEvidenceLinks,
  listRevenueForecastScenarios,
  listRevenueRiskSignals,
  listVendorCategorySummaries,
  markExecutiveInsightReviewed as markExecutiveInsightReviewedRepo
} from "@/lib/revenue-intelligence/repositories/admin-revenue-intelligence-repository";

function safeMetadata(input: Record<string, unknown>) {
  return sanitizeQuoteEvidence(input) as Record<string, unknown>;
}

function sum(metrics: CommercialImpactMetric[], type: CommercialImpactMetric["metric_type"]) {
  return metrics.filter((metric) => metric.metric_type === type).reduce((total, metric) => total + metric.amount, 0);
}

async function auditRevenue(input: {
  organizationId: string;
  actorUserId?: string | null;
  eventType: string;
  metadata?: Record<string, unknown>;
  severity?: "info" | "warning" | "critical";
}) {
  await recordEnterpriseAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    eventCategory: "evidence",
    eventSource: "revenue_intelligence",
    severity: input.severity ?? "info",
    metadata: safeMetadata(input.metadata ?? {}),
    mode: "best_effort"
  });
}

export async function generateRevenueIntelligenceSnapshot(input: {
  organizationId: string;
  actorUserId?: string | null;
}) {
  const started = Date.now();
  const source = await loadRevenueIntelligenceSourceData({ organizationId: input.organizationId });
  const aggregated = aggregateRevenueIntelligence(source);
  const forecastInputs = buildRevenueForecastScenarios({
    metrics: aggregated.metrics,
    signals: aggregated.signals
  });
  const insightInputs = generateExecutiveInsights({
    signals: aggregated.signals,
    metrics: aggregated.metrics,
    vendorCategorySummaries: aggregated.vendorCategorySummaries
  });

  const totalRenewalValueAtRisk = aggregated.metrics
    .filter((metric) => metric.metric_type === "renewal_value_at_risk")
    .reduce((total, metric) => total + metric.amount, 0);
  const priceIncreaseExposure = aggregated.metrics
    .filter((metric) => metric.metric_type === "price_increase_exposure")
    .reduce((total, metric) => total + metric.amount, 0);
  const savingsIdentified = aggregated.metrics
    .filter((metric) => metric.metric_type === "savings_identified")
    .reduce((total, metric) => total + metric.amount, 0);
  const savingsApproved = aggregated.metrics
    .filter((metric) => metric.metric_type === "savings_approved")
    .reduce((total, metric) => total + metric.amount, 0);
  const savingsRealized = aggregated.metrics
    .filter((metric) => metric.metric_type === "savings_realized")
    .reduce((total, metric) => total + metric.amount, 0);
  const currency = aggregated.metrics.find((metric) => metric.currency)?.currency ?? null;

  const snapshotResult = await createRevenueIntelligenceSnapshot({
    organizationId: input.organizationId,
    createdByUserId: input.actorUserId ?? null,
    values: {
      period_start: null,
      period_end: null,
      summary: safeMetadata(aggregated.snapshotSummary),
      total_renewal_value_at_risk: totalRenewalValueAtRisk,
      price_increase_exposure: priceIncreaseExposure,
      savings_identified: savingsIdentified,
      savings_approved: savingsApproved,
      savings_realized: savingsRealized,
      net_commercial_impact: savingsApproved + savingsRealized - priceIncreaseExposure,
      currency,
      signal_count: aggregated.signals.length,
      metric_count: aggregated.metrics.length,
      insight_count: insightInputs.length,
      source_fingerprint: `revenue_snapshot:${source.contracts.length}:${aggregated.signals.length}:${aggregated.metrics.length}:${new Date().toISOString().slice(0, 10)}`
    }
  });
  if (snapshotResult.error) throw snapshotResult.error;
  if (!snapshotResult.data) throw new Error("Revenue intelligence snapshot was not created.");
  const snapshot = snapshotResult.data;

  await Promise.all([
    refreshRevenueRiskSignals({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      signals: aggregated.signals
    }),
    refreshCommercialImpactMetrics({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      metrics: aggregated.metrics
    }),
    refreshVendorCategorySummaries({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      summaries: aggregated.vendorCategorySummaries
    }),
    refreshRevenueForecastScenarios({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      forecasts: forecastInputs
    }),
    refreshExecutiveInsights({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      insights: insightInputs
    }),
    refreshRevenueEvidenceLinks({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId ?? null,
      snapshotId: snapshot.id,
      evidenceLinks: aggregated.evidenceLinks
    })
  ]);

  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.snapshot_generated",
    metadata: {
      snapshotId: snapshot.id,
      signalCount: aggregated.signals.length,
      metricCount: aggregated.metrics.length,
      insightCount: insightInputs.length,
      aggregateAmounts: {
        totalRenewalValueAtRisk,
        priceIncreaseExposure,
        savingsIdentified,
        savingsApproved,
        savingsRealized
      },
      currency,
      refreshDurationBucket: Date.now() - started < 1000 ? "sub_1s" : "over_1s"
    },
    severity: aggregated.signals.some((signal) => signal.severity === "critical") ? "warning" : "info"
  });

  return snapshot;
}

export async function refreshRevenueRiskSignals(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  signals: Array<Omit<RevenueRiskSignal, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
}) {
  const refreshed: RevenueRiskSignal[] = [];
  for (const signal of input.signals) {
    const result = await createOrUpdateRevenueRiskSignal({
      organizationId: input.organizationId,
      sourceFingerprint: signal.source_fingerprint,
      createdByUserId: input.actorUserId ?? null,
      values: { ...signal, snapshot_id: input.snapshotId }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  await archiveStaleRevenueSignals({
    organizationId: input.organizationId,
    activeFingerprints: input.signals.map((signal) => signal.source_fingerprint)
  });
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.signals_refreshed",
    metadata: { snapshotId: input.snapshotId, signalCount: refreshed.length }
  });
  return refreshed;
}

export async function refreshCommercialImpactMetrics(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  metrics: Array<Omit<CommercialImpactMetric, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
}) {
  const refreshed: CommercialImpactMetric[] = [];
  for (const metric of input.metrics) {
    const result = await createOrUpdateCommercialImpactMetric({
      organizationId: input.organizationId,
      sourceFingerprint: metric.source_fingerprint,
      createdByUserId: input.actorUserId ?? null,
      values: { ...metric, snapshot_id: input.snapshotId, metadata: safeMetadata(metric.metadata as Record<string, unknown>) }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.metrics_refreshed",
    metadata: { snapshotId: input.snapshotId, metricCount: refreshed.length }
  });
  return refreshed;
}

export async function refreshVendorCategorySummaries(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  summaries: Parameters<typeof createOrUpdateVendorCategorySummary>[0]["values"][];
}) {
  const refreshed = [];
  for (const summary of input.summaries) {
    const result = await createOrUpdateVendorCategorySummary({
      organizationId: input.organizationId,
      sourceFingerprint: String(summary.source_fingerprint),
      createdByUserId: input.actorUserId ?? null,
      values: { ...summary, snapshot_id: input.snapshotId }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.vendor_category_refreshed",
    metadata: { snapshotId: input.snapshotId, summaryCount: refreshed.length }
  });
  return refreshed;
}

export async function refreshRevenueForecastScenarios(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  forecasts: Parameters<typeof createOrUpdateRevenueForecastScenario>[0]["values"][];
}) {
  const refreshed = [];
  for (const forecast of input.forecasts) {
    const result = await createOrUpdateRevenueForecastScenario({
      organizationId: input.organizationId,
      sourceFingerprint: String(forecast.source_fingerprint),
      createdByUserId: input.actorUserId ?? null,
      values: { ...forecast, snapshot_id: input.snapshotId }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.forecast_refreshed",
    metadata: { snapshotId: input.snapshotId, forecastScenarioCount: refreshed.length }
  });
  return refreshed;
}

export async function refreshExecutiveInsights(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  insights: Parameters<typeof createOrUpdateExecutiveInsight>[0]["values"][];
}) {
  const refreshed: ExecutiveInsight[] = [];
  for (const insight of input.insights) {
    const result = await createOrUpdateExecutiveInsight({
      organizationId: input.organizationId,
      sourceFingerprint: String(insight.source_fingerprint),
      createdByUserId: input.actorUserId ?? null,
      values: { ...insight, snapshot_id: input.snapshotId }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.insights_refreshed",
    metadata: { snapshotId: input.snapshotId, insightCount: refreshed.length }
  });
  return refreshed;
}

async function refreshRevenueEvidenceLinks(input: {
  organizationId: string;
  actorUserId?: string | null;
  snapshotId: string;
  evidenceLinks: Array<Omit<RevenueIntelligenceEvidenceLink, "id" | "organization_id" | "snapshot_id" | "signal_id" | "metric_id" | "insight_id" | "created_at" | "updated_at">>;
}) {
  const refreshed: RevenueIntelligenceEvidenceLink[] = [];
  for (const link of input.evidenceLinks) {
    const result = await createOrUpdateRevenueEvidenceLink({
      organizationId: input.organizationId,
      sourceFingerprint: link.source_fingerprint,
      createdByUserId: input.actorUserId ?? null,
      values: { ...link, snapshot_id: input.snapshotId }
    });
    if (result.error) throw result.error;
    if (result.data) refreshed.push(result.data);
  }
  return refreshed;
}

export async function getRevenueIntelligenceDashboard(input: {
  organizationId: string;
}): Promise<RevenueIntelligenceDashboard> {
  const latest = await getLatestRevenueIntelligenceSnapshot({ organizationId: input.organizationId });
  if (latest.error) throw latest.error;
  const snapshot = latest.data ?? null;
  const [signals, metrics, summaries, forecasts, insights, evidence] = await Promise.all([
    listRevenueRiskSignals({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active", limit: 100 }),
    listCommercialImpactMetrics({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active", limit: 100 }),
    listVendorCategorySummaries({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active", limit: 50 }),
    listRevenueForecastScenarios({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active" }),
    listExecutiveInsights({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active", limit: 50 }),
    listRevenueEvidenceLinks({ organizationId: input.organizationId, snapshotId: snapshot?.id, status: "active", limit: 200 })
  ]);
  for (const result of [signals, metrics, summaries, forecasts, insights, evidence]) {
    if (result.error) throw result.error;
  }
  const signalRows = signals.data ?? [];
  const metricRows = metrics.data ?? [];
  const evidenceRows = evidence.data ?? [];
  const riskQueue = signalRows
    .filter((signal) => signal.status === "active")
    .map((signal) => ({
      ...signal,
      evidenceLinks: evidenceRows.filter((link) =>
        link.contract_id === signal.contract_id ||
        link.commercial_decision_id === signal.commercial_decision_id ||
        link.quote_comparison_id === signal.quote_comparison_id ||
        link.savings_opportunity_id === signal.savings_opportunity_id
      )
    }));
  return {
    snapshot,
    metrics: metricRows,
    signals: signalRows,
    vendorCategorySummaries: summaries.data ?? [],
    forecasts: forecasts.data ?? [],
    insights: insights.data ?? [],
    evidenceLinks: evidenceRows,
    riskQueue,
    opportunities: listRevenueOpportunitiesFromData(metricRows, evidenceRows),
    kpis: {
      totalRenewalValueAtRisk: snapshot?.total_renewal_value_at_risk ?? sum(metricRows, "renewal_value_at_risk"),
      priceIncreaseExposure: snapshot?.price_increase_exposure ?? sum(metricRows, "price_increase_exposure"),
      savingsIdentified: snapshot?.savings_identified ?? sum(metricRows, "savings_identified"),
      savingsApproved: snapshot?.savings_approved ?? sum(metricRows, "savings_approved"),
      savingsRealized: snapshot?.savings_realized ?? sum(metricRows, "savings_realized"),
      forecastedSavings: (forecasts.data ?? []).find((forecast) => forecast.scenario === "expected")?.forecasted_savings ?? 0,
      netCommercialImpact: snapshot?.net_commercial_impact ?? 0,
      criticalRiskCount: signalRows.filter((signal) => signal.severity === "critical").length,
      blockedDecisionCount: signalRows.filter((signal) => signal.signal_type === "decision_blocked").length,
      approvalStalledCount: signalRows.filter((signal) => signal.signal_type === "approval_stalled").length,
      negotiationPipelineValue: sum(metricRows, "negotiation_pipeline_value"),
      outreachPipelineValue: sum(metricRows, "outreach_pipeline_value")
    }
  };
}

function listRevenueOpportunitiesFromData(
  metrics: CommercialImpactMetric[],
  evidenceLinks: RevenueIntelligenceEvidenceLink[]
) {
  return metrics
    .filter((metric) => ["savings_identified", "savings_approved", "negotiation_pipeline_value", "outreach_pipeline_value"].includes(metric.metric_type))
    .map((metric) => ({
      id: metric.id,
      type: metric.metric_type.startsWith("savings") ? "savings" as const : metric.metric_type.startsWith("negotiation") ? "negotiation" as const : "outreach" as const,
      title: metric.label,
      amount: metric.amount,
      currency: metric.currency,
      status: metric.status,
      contractId: metric.contract_id,
      sourceId: metric.savings_opportunity_id ?? metric.commercial_decision_id ?? metric.id,
      evidenceLinks: evidenceLinks.filter((link) =>
        link.contract_id === metric.contract_id ||
        link.savings_opportunity_id === metric.savings_opportunity_id ||
        link.commercial_decision_id === metric.commercial_decision_id
      )
    }));
}

export async function listRevenueRiskQueue(input: { organizationId: string }) {
  return (await getRevenueIntelligenceDashboard(input)).riskQueue;
}

export async function listRevenueOpportunities(input: { organizationId: string }) {
  return (await getRevenueIntelligenceDashboard(input)).opportunities;
}

export async function markExecutiveInsightReviewed(input: {
  organizationId: string;
  insightId: string;
  actorUserId: string;
}) {
  const result = await markExecutiveInsightReviewedRepo(input);
  if (result.error) throw result.error;
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventType: "revenue_intelligence.insight_reviewed",
    metadata: { reviewedInsightId: input.insightId }
  });
  return result.data;
}

export async function archiveRevenueSignal(input: {
  organizationId: string;
  signalId: string;
  actorUserId: string;
}) {
  const result = await archiveRevenueRiskSignal(input);
  if (result.error) throw result.error;
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventType: "revenue_intelligence.signal_archived",
    metadata: { archivedSignalId: input.signalId }
  });
  return result.data;
}

export async function enqueueRevenueIntelligenceRefreshJob(input: {
  organizationId: string;
  actorUserId?: string | null;
}) {
  const job = await enqueueBackgroundJob({
    organizationId: input.organizationId,
    jobType: "revenue_intelligence_refresh",
    idempotencyKey: `revenue_intelligence_refresh:${input.organizationId}`,
    payload: {
      organization_id: input.organizationId,
      requested_by_user_id: input.actorUserId ?? null
    },
    priority: 75
  });
  await auditRevenue({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventType: "revenue_intelligence.refresh_job_enqueued",
    metadata: { jobId: job.id, sourceModule: "revenue_intelligence" }
  });
  return job;
}
