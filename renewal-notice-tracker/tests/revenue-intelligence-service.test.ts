import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  archiveRevenueRiskSignal: vi.fn(),
  archiveStaleRevenueSignals: vi.fn(),
  createOrUpdateCommercialImpactMetric: vi.fn(),
  createOrUpdateExecutiveInsight: vi.fn(),
  createOrUpdateRevenueEvidenceLink: vi.fn(),
  createOrUpdateRevenueForecastScenario: vi.fn(),
  createOrUpdateRevenueRiskSignal: vi.fn(),
  createOrUpdateVendorCategorySummary: vi.fn(),
  createRevenueIntelligenceSnapshot: vi.fn(),
  getLatestRevenueIntelligenceSnapshot: vi.fn(),
  listCommercialImpactMetrics: vi.fn(),
  listExecutiveInsights: vi.fn(),
  listRevenueEvidenceLinks: vi.fn(),
  listRevenueForecastScenarios: vi.fn(),
  listRevenueRiskSignals: vi.fn(),
  listVendorCategorySummaries: vi.fn(),
  markExecutiveInsightReviewed: vi.fn()
}));
const source = vi.hoisted(() => ({ loadRevenueIntelligenceSourceData: vi.fn() }));
const audit = vi.hoisted(() => ({ recordEnterpriseAuditEvent: vi.fn() }));
const jobs = vi.hoisted(() => ({ enqueueBackgroundJob: vi.fn() }));

vi.mock("@/lib/revenue-intelligence/repositories/admin-revenue-intelligence-repository", () => repo);
vi.mock("@/lib/revenue-intelligence/revenue-intelligence-source-queries", () => source);
vi.mock("@/lib/enterprise-audit/audit-recorder", () => audit);
vi.mock("@/lib/background-jobs/job-queue", () => jobs);

function emptyResult(data: unknown[] = []) {
  return { data, error: null };
}

function sourceData() {
  return {
    organizationId: "org-1",
    contracts: [{
      id: "contract-1",
      owner_user_id: "owner-1",
      cycle_status: "open",
      renewal_decision_status: "undecided",
      department: "Finance",
      status_tag: "saas",
      metadata: {
        counterparty_name: "Vendor A",
        contract_type: "SaaS",
        notice_deadline_date: "2020-01-01",
        contract_value_amount: 100000,
        contract_value_currency: "USD",
        needs_review: true
      },
      reminders: [{ id: "reminder-1", status: "blocked", remind_at: "2020-01-01" }]
    }],
    quoteComparisons: [],
    quoteFindings: [],
    savingsOpportunities: [],
    commercialDecisions: [{
      id: "decision-1",
      contract_id: "contract-1",
      decision_status: "in_approval",
      commercial_risk_level: "critical",
      estimated_savings_amount: 12000,
      currency: "USD",
      blocker_codes: ["missing_approver"],
      warning_codes: [],
      evidence_confidence: 0.9,
      owner_user_id: "owner-1",
      approver_user_id: null,
      updated_at: "2020-01-01T00:00:00.000Z"
    }],
    negotiationBriefs: [],
    outreachOpportunities: []
  };
}

describe("revenue intelligence service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    source.loadRevenueIntelligenceSourceData.mockResolvedValue(sourceData());
    audit.recordEnterpriseAuditEvent.mockResolvedValue({ ok: true });
    jobs.enqueueBackgroundJob.mockResolvedValue({ id: "job-1" });
    repo.createRevenueIntelligenceSnapshot.mockResolvedValue({
      data: {
        id: "snapshot-1",
        organization_id: "org-1",
        total_renewal_value_at_risk: 100000,
        price_increase_exposure: 0,
        savings_identified: 0,
        savings_approved: 0,
        savings_realized: 0,
        net_commercial_impact: 0,
        currency: "USD",
        signal_count: 4,
        metric_count: 2,
        insight_count: 2,
        status: "active",
        source_fingerprint: "snapshot",
        summary: {},
        period_start: null,
        period_end: null,
        created_by_user_id: "user-1",
        created_at: "2030-01-01T00:00:00.000Z",
        updated_at: "2030-01-01T00:00:00.000Z"
      },
      error: null
    });
    repo.createOrUpdateRevenueRiskSignal.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({
      data: {
        id: String(values.source_fingerprint),
        organization_id: "org-1",
        snapshot_id: "snapshot-1",
        created_at: "2030-01-01T00:00:00.000Z",
        updated_at: "2030-01-01T00:00:00.000Z",
        ...values
      },
      error: null
    }));
    repo.createOrUpdateCommercialImpactMetric.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({ data: values, error: null }));
    repo.createOrUpdateVendorCategorySummary.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({ data: values, error: null }));
    repo.createOrUpdateRevenueForecastScenario.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({ data: values, error: null }));
    repo.createOrUpdateExecutiveInsight.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({ data: values, error: null }));
    repo.createOrUpdateRevenueEvidenceLink.mockImplementation(async ({ values }: { values: Record<string, unknown> }) => ({ data: values, error: null }));
    repo.archiveStaleRevenueSignals.mockResolvedValue(emptyResult());
    repo.archiveRevenueRiskSignal.mockResolvedValue({ data: { id: "signal-1" }, error: null });
    repo.markExecutiveInsightReviewed.mockResolvedValue({ data: { id: "insight-1" }, error: null });
  });

  it("generates a snapshot, refreshes derived records, archives stale signals, and audits safe metadata", async () => {
    const { generateRevenueIntelligenceSnapshot } = await import("@/lib/revenue-intelligence/revenue-intelligence");

    await expect(
      generateRevenueIntelligenceSnapshot({ organizationId: "org-1", actorUserId: "user-1" })
    ).resolves.toEqual(expect.objectContaining({ id: "snapshot-1" }));

    expect(source.loadRevenueIntelligenceSourceData).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(repo.createRevenueIntelligenceSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      createdByUserId: "user-1"
    }));
    expect(repo.createOrUpdateRevenueRiskSignal).toHaveBeenCalled();
    expect(repo.archiveStaleRevenueSignals).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      activeFingerprints: expect.arrayContaining([expect.stringContaining("revenue_signal:")])
    }));
    const auditCalls = JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls);
    expect(auditCalls).toContain("revenue_intelligence.snapshot_generated");
    expect(auditCalls).toContain("revenue_intelligence.signals_refreshed");
    expect(auditCalls).not.toContain("raw contract text");
    expect(auditCalls).not.toContain("OCR output");
    expect(auditCalls).not.toContain("provider payload");
  });

  it("sanitizes metric metadata before persistence and audit", async () => {
    const { refreshCommercialImpactMetrics } = await import("@/lib/revenue-intelligence/revenue-intelligence");

    await refreshCommercialImpactMetrics({
      organizationId: "org-1",
      actorUserId: "user-1",
      snapshotId: "snapshot-1",
      metrics: [{
        contract_id: "contract-1",
        commercial_decision_id: null,
        quote_comparison_id: null,
        savings_opportunity_id: null,
        metric_type: "price_increase_exposure",
        label: "Safe metric",
        amount: 100,
        currency: "USD",
        source_module: "revenue_intelligence",
        source_fingerprint: "metric-1",
        status: "active",
        evidence_confidence: 0.9,
        metadata: {
          safeCount: 1,
          raw_contract_text: "raw contract text marker",
          nested: { provider_payload: "provider payload marker", status: "safe" }
        },
        created_by_user_id: "user-1"
      }]
    });

    const firstMetricCall = repo.createOrUpdateCommercialImpactMetric.mock.calls[0];
    expect(firstMetricCall).toBeDefined();
    const persisted = firstMetricCall![0].values.metadata;
    expect(persisted).toEqual({ safeCount: 1, nested: { status: "safe" } });
    expect(JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls)).not.toContain("raw contract text marker");
    expect(JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls)).not.toContain("provider payload marker");
  });

  it("enqueues refresh jobs with idempotency and safe audit metadata", async () => {
    const { enqueueRevenueIntelligenceRefreshJob } = await import("@/lib/revenue-intelligence/revenue-intelligence");

    await enqueueRevenueIntelligenceRefreshJob({ organizationId: "org-1", actorUserId: "user-1" });

    expect(jobs.enqueueBackgroundJob).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      jobType: "revenue_intelligence_refresh",
      idempotencyKey: "revenue_intelligence_refresh:org-1"
    }));
    expect(JSON.stringify(audit.recordEnterpriseAuditEvent.mock.calls)).toContain("revenue_intelligence.refresh_job_enqueued");
  });
});
