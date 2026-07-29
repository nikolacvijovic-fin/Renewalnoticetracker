import type {
  CommercialImpactMetric,
  ExecutiveInsight,
  ExecutiveInsightSeverity,
  RevenueIntelligenceEvidenceLink,
  RevenueRiskSignal,
  VendorCategoryIntelligenceSummary
} from "@/lib/revenue-intelligence/revenue-types";

function money(value: number, currency: string | null | undefined) {
  return `${currency ?? "$"}${Math.round(value).toLocaleString("en-US")}`;
}

function sum(metrics: Array<Pick<CommercialImpactMetric, "metric_type" | "amount">>, type: CommercialImpactMetric["metric_type"]) {
  return metrics.filter((metric) => metric.metric_type === type).reduce((total, metric) => total + metric.amount, 0);
}

function insight(input: {
  title: string;
  summary: string;
  severity: ExecutiveInsightSeverity;
  recommendedAction: string;
  confidenceScore?: number;
  sourceFingerprint: string;
}): Omit<ExecutiveInsight, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at"> {
  return {
    title: input.title.slice(0, 180),
    summary: input.summary.slice(0, 900),
    severity: input.severity,
    recommended_action: input.recommendedAction.slice(0, 300),
    confidence_score: input.confidenceScore ?? 0.8,
    reviewed: false,
    reviewed_by_user_id: null,
    reviewed_at: null,
    source_module: "revenue_intelligence",
    source_fingerprint: input.sourceFingerprint,
    status: "active",
    created_by_user_id: null
  };
}

export function generateExecutiveInsights(input: {
  signals: RevenueRiskSignal[] | Array<Omit<RevenueRiskSignal, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  metrics: CommercialImpactMetric[] | Array<Omit<CommercialImpactMetric, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  vendorCategorySummaries: VendorCategoryIntelligenceSummary[] | Array<Omit<VendorCategoryIntelligenceSummary, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  evidenceLinks?: RevenueIntelligenceEvidenceLink[];
}) {
  const insights: Array<Omit<ExecutiveInsight, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">> = [];
  const criticalQuoteSignals = input.signals.filter((signal) => signal.signal_type === "critical_quote_finding");
  if (criticalQuoteSignals.length) {
    insights.push(insight({
      title: `${criticalQuoteSignals.length} renewals have critical quote findings`,
      summary: `${criticalQuoteSignals.length} active renewal quote findings are critical and need leadership review.`,
      severity: "critical",
      recommendedAction: "Escalate critical quote findings to finance and procurement owners.",
      sourceFingerprint: "revenue_insight:critical_quote_findings"
    }));
  }

  const expiredDeadlines = input.signals.filter((signal) => signal.signal_type === "expired_notice_deadline");
  if (expiredDeadlines.length) {
    insights.push(insight({
      title: `${expiredDeadlines.length} notice deadline${expiredDeadlines.length === 1 ? " has" : "s have"} expired`,
      summary: "Expired notice deadlines require immediate internal escalation before renewal options narrow further.",
      severity: "critical",
      recommendedAction: "Escalate expired notice deadlines and confirm mitigation options.",
      sourceFingerprint: "revenue_insight:expired_notice_deadlines"
    }));
  }

  const savingsIdentified = sum(input.metrics, "savings_identified");
  const savingsApproved = sum(input.metrics, "savings_approved");
  const currency = input.metrics.find((metric) => metric.currency)?.currency ?? "$";
  if (savingsIdentified > savingsApproved) {
    insights.push(insight({
      title: `${money(savingsIdentified - savingsApproved, currency)} savings identified but not approved`,
      summary: "Savings opportunities exist, but approval and ownership have not fully caught up.",
      severity: "high",
      recommendedAction: "Review savings pipeline and assign approval owners.",
      sourceFingerprint: "revenue_insight:savings_not_approved"
    }));
  }

  const blocked = input.signals.filter((signal) => signal.signal_type === "decision_blocked");
  if (blocked.length) {
    insights.push(insight({
      title: `${blocked.length} commercial decisions are blocked`,
      summary: "Blocked decisions are delaying renewal defense execution.",
      severity: blocked.some((signal) => signal.severity === "critical") ? "critical" : "high",
      recommendedAction: "Resolve missing owners, approvers, quote evidence, or blocker codes.",
      sourceFingerprint: "revenue_insight:blocked_decisions"
    }));
  }

  const topVendor = input.vendorCategorySummaries
    .filter((summary) => summary.summary_type === "vendor")
    .sort((a, b) => b.renewal_value - a.renewal_value)[0];
  if (topVendor && topVendor.renewal_value > 0) {
    insights.push(insight({
      title: `${topVendor.vendor_name ?? "A vendor"} drives ${money(topVendor.renewal_value, topVendor.currency)} renewal exposure`,
      summary: `${topVendor.contract_count} contracts roll up to this vendor exposure summary.`,
      severity: topVendor.severity,
      recommendedAction: "Review vendor concentration and renewal negotiation posture.",
      sourceFingerprint: `revenue_insight:vendor:${topVendor.source_fingerprint}`
    }));
  }

  return insights;
}
