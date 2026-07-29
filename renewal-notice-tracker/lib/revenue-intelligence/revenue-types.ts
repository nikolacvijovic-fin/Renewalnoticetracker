import type { Json } from "@/lib/supabase/database.types";

export const REVENUE_RISK_SIGNAL_TYPES = [
  "renewal_at_risk",
  "price_increase",
  "critical_quote_finding",
  "savings_opportunity",
  "vendor_concentration",
  "category_concentration",
  "decision_blocked",
  "approval_stalled",
  "negotiation_in_progress",
  "outreach_pending",
  "trusted_reminder_blocked",
  "weak_contract_evidence",
  "expired_notice_deadline",
  "expansion_signal",
  "churn_prevention"
] as const;

export const COMMERCIAL_IMPACT_METRIC_TYPES = [
  "renewal_value_at_risk",
  "price_increase_exposure",
  "savings_identified",
  "savings_approved",
  "savings_realized",
  "negotiation_pipeline_value",
  "blocked_decision_value",
  "outreach_pipeline_value",
  "vendor_concentration_value",
  "category_concentration_value",
  "forecasted_renewal_spend",
  "forecasted_savings",
  "net_commercial_impact"
] as const;

export const EXECUTIVE_INSIGHT_SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export const REVENUE_FORECAST_SCENARIOS = ["conservative", "expected", "aggressive", "risk_adjusted"] as const;

export type RevenueRiskSignalType = (typeof REVENUE_RISK_SIGNAL_TYPES)[number];
export type CommercialImpactMetricType = (typeof COMMERCIAL_IMPACT_METRIC_TYPES)[number];
export type ExecutiveInsightSeverity = (typeof EXECUTIVE_INSIGHT_SEVERITIES)[number];
export type RevenueForecastScenarioType = (typeof REVENUE_FORECAST_SCENARIOS)[number];
export type RevenueRecordStatus = "active" | "reviewed" | "archived";

export type RevenueIntelligenceSnapshot = {
  id: string;
  organization_id: string;
  period_start: string | null;
  period_end: string | null;
  status: RevenueRecordStatus;
  summary: Json;
  total_renewal_value_at_risk: number;
  price_increase_exposure: number;
  savings_identified: number;
  savings_approved: number;
  savings_realized: number;
  net_commercial_impact: number;
  currency: string | null;
  signal_count: number;
  metric_count: number;
  insight_count: number;
  source_fingerprint: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueRiskSignal = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  contract_id: string | null;
  commercial_decision_id: string | null;
  quote_comparison_id: string | null;
  savings_opportunity_id: string | null;
  negotiation_brief_id: string | null;
  outreach_opportunity_id: string | null;
  signal_type: RevenueRiskSignalType;
  severity: ExecutiveInsightSeverity;
  title: string;
  summary: string;
  vendor_name: string | null;
  category_name: string | null;
  amount: number;
  currency: string | null;
  evidence_confidence: number | null;
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  warning_codes: string[];
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CommercialImpactMetric = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  contract_id: string | null;
  commercial_decision_id: string | null;
  quote_comparison_id: string | null;
  savings_opportunity_id: string | null;
  metric_type: CommercialImpactMetricType;
  label: string;
  amount: number;
  currency: string | null;
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  evidence_confidence: number | null;
  metadata: Json;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorCategoryIntelligenceSummary = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  vendor_name: string | null;
  category_name: string | null;
  summary_type: "vendor" | "category";
  contract_count: number;
  renewal_value: number;
  risk_signal_count: number;
  currency: string | null;
  severity: ExecutiveInsightSeverity;
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueForecastScenario = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  scenario: RevenueForecastScenarioType;
  forecasted_renewal_spend: number;
  forecasted_savings: number;
  net_commercial_impact: number;
  risk_adjusted_exposure: number;
  currency: string | null;
  confidence_score: number;
  assumptions: string[];
  warning_codes: string[];
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExecutiveInsight = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  title: string;
  summary: string;
  severity: ExecutiveInsightSeverity;
  recommended_action: string;
  confidence_score: number;
  reviewed: boolean;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueIntelligenceEvidenceLink = {
  id: string;
  organization_id: string;
  snapshot_id: string | null;
  signal_id: string | null;
  metric_id: string | null;
  insight_id: string | null;
  contract_id: string | null;
  commercial_decision_id: string | null;
  quote_comparison_id: string | null;
  savings_opportunity_id: string | null;
  negotiation_brief_id: string | null;
  outreach_opportunity_id: string | null;
  evidence_type: string;
  evidence_id: string | null;
  evidence_label: string;
  evidence_url: string | null;
  evidence_confidence: number | null;
  source_module: string;
  source_fingerprint: string;
  status: RevenueRecordStatus;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueRiskQueueItem = RevenueRiskSignal & {
  evidenceLinks: RevenueIntelligenceEvidenceLink[];
};

export type RevenueOpportunityItem = {
  id: string;
  type: "savings" | "negotiation" | "outreach";
  title: string;
  amount: number;
  currency: string | null;
  status: string;
  contractId: string | null;
  sourceId: string | null;
  evidenceLinks: RevenueIntelligenceEvidenceLink[];
};

export type RevenueIntelligenceDashboard = {
  snapshot: RevenueIntelligenceSnapshot | null;
  metrics: CommercialImpactMetric[];
  signals: RevenueRiskSignal[];
  vendorCategorySummaries: VendorCategoryIntelligenceSummary[];
  forecasts: RevenueForecastScenario[];
  insights: ExecutiveInsight[];
  evidenceLinks: RevenueIntelligenceEvidenceLink[];
  riskQueue: RevenueRiskQueueItem[];
  opportunities: RevenueOpportunityItem[];
  kpis: {
    totalRenewalValueAtRisk: number;
    priceIncreaseExposure: number;
    savingsIdentified: number;
    savingsApproved: number;
    savingsRealized: number;
    forecastedSavings: number;
    netCommercialImpact: number;
    criticalRiskCount: number;
    blockedDecisionCount: number;
    approvalStalledCount: number;
    negotiationPipelineValue: number;
    outreachPipelineValue: number;
  };
};

export type RevenueAggregationOutput = {
  snapshotSummary: Record<string, Json | undefined>;
  signals: Array<Omit<RevenueRiskSignal, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  metrics: Array<Omit<CommercialImpactMetric, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  vendorCategorySummaries: Array<Omit<VendorCategoryIntelligenceSummary, "id" | "organization_id" | "snapshot_id" | "created_at" | "updated_at">>;
  evidenceLinks: Array<Omit<RevenueIntelligenceEvidenceLink, "id" | "organization_id" | "snapshot_id" | "signal_id" | "metric_id" | "insight_id" | "created_at" | "updated_at">>;
};
