export const QUOTE_COMPARISON_STATUSES = [
  "draft",
  "processing",
  "completed",
  "failed",
  "reviewed",
  "archived"
] as const;

export const QUOTE_FINDING_TYPES = [
  "price_increase",
  "discount_removed",
  "sku_changed",
  "payment_terms_changed",
  "renewal_term_changed",
  "auto_renew_risk",
  "notice_window_risk",
  "usage_mismatch",
  "duplicate_vendor_risk",
  "unfavorable_clause_change"
] as const;

export const QUOTE_RISK_LEVELS = ["unknown", "info", "low", "medium", "high", "critical"] as const;
export const QUOTE_FINDING_STATUSES = ["open", "reviewed", "dismissed", "accepted"] as const;
export const SAVINGS_OPPORTUNITY_STATUSES = ["open", "in_review", "accepted", "dismissed", "realized"] as const;

export type QuoteComparisonStatus = (typeof QUOTE_COMPARISON_STATUSES)[number];
export type QuoteFindingType = (typeof QUOTE_FINDING_TYPES)[number];
export type QuoteRiskLevel = (typeof QUOTE_RISK_LEVELS)[number];
export type QuoteFindingStatus = (typeof QUOTE_FINDING_STATUSES)[number];
export type SavingsOpportunityStatus = (typeof SAVINGS_OPPORTUNITY_STATUSES)[number];
export type QuoteComparisonMode = "deterministic_scaffold" | "provider_backed";

export type SafeQuoteCitation = {
  sourceFileId?: string | null;
  page?: number | null;
  snippet?: string | null;
  evidenceLabel?: string | null;
};

export type NormalizedQuoteTerms = {
  totalAmount: number | null;
  currency: string | null;
  discounts: string[];
  skuList: string[];
  paymentTerms: string | null;
  renewalTerm: string | null;
  autoRenewal: boolean | null;
  noticeDeadlineDate: string | null;
};

export type QuoteFindingInput = {
  findingType: QuoteFindingType;
  severity: Exclude<QuoteRiskLevel, "unknown">;
  title: string;
  description: string;
  currentValue?: unknown;
  proposedValue?: unknown;
  deltaValue?: unknown;
  confidence: number;
  citation?: SafeQuoteCitation | null;
};

export type QuoteComparisonResult = {
  currentTotalAmount: number | null;
  proposedTotalAmount: number | null;
  currency: string | null;
  priceDeltaAmount: number | null;
  priceDeltaPercent: number | null;
  overallRiskLevel: QuoteRiskLevel;
  findings: QuoteFindingInput[];
  savingsOpportunities: SavingsOpportunityInput[];
  recommendationSummary: string;
  warnings: string[];
};

export type SavingsOpportunityInput = {
  opportunityType: string;
  title: string;
  estimatedSavingsAmount?: number | null;
  currency?: string | null;
  confidence: number;
  evidence: Record<string, unknown>;
};

export type RenewalQuoteComparison = {
  id: string;
  organization_id: string;
  contract_id: string;
  quote_file_id: string | null;
  status: QuoteComparisonStatus;
  source: string;
  requested_by_user_id: string | null;
  current_total_amount: number | null;
  proposed_total_amount: number | null;
  currency: string | null;
  price_delta_amount: number | null;
  price_delta_percent: number | null;
  overall_risk_level: QuoteRiskLevel;
  recommendation_summary: string | null;
  safe_error_message?: string | null;
  warning_codes?: string[] | null;
  created_at: string;
  updated_at: string;
};

export type RenewalQuoteFinding = {
  id: string;
  organization_id: string;
  comparison_id: string;
  contract_id: string;
  finding_type: QuoteFindingType;
  severity: Exclude<QuoteRiskLevel, "unknown">;
  title: string;
  description: string;
  current_value: unknown | null;
  proposed_value: unknown | null;
  delta_value: unknown | null;
  confidence: number;
  citation: unknown | null;
  status: QuoteFindingStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type SavingsOpportunity = {
  id: string;
  organization_id: string;
  contract_id: string;
  comparison_id: string | null;
  opportunity_type: string;
  title: string;
  estimated_savings_amount: number | null;
  currency: string | null;
  confidence: number;
  status: SavingsOpportunityStatus;
  owner_user_id: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};
