import { callAddOnJson, type AddOnClientOptions, type AddOnHealthResponse } from "@/lib/add-ons/client-core";
import { getAppConfig } from "@/lib/config";

export type ExtractContractRequest = {
  organization_id: string;
  contract_id: string;
  file_id?: string;
  file_url?: string;
  sample_text?: string;
  extraction_mode: "deterministic_scaffold" | "provider_backed";
};

export type ExtractContractFieldCitation = {
  source_file_id?: string | null;
  page?: number | null;
  snippet?: string | null;
  offsets?: Record<string, unknown> | null;
};

export type ExtractContractField = {
  field_key: string;
  extracted_value: unknown;
  normalized_value?: unknown;
  confidence: number;
  citations: ExtractContractFieldCitation[];
  warning_codes: string[];
};

export type ExtractContractResponse = {
  extraction_run_id?: string | null;
  fields: ExtractContractField[];
  overall_confidence: number;
  warnings: string[];
};

export type CompareQuoteRequest = {
  organization_id: string;
  contract_id: string;
  current_terms: Record<string, unknown>;
  proposed_terms: Record<string, unknown>;
  quote_text?: string;
  comparison_mode?: "deterministic_scaffold" | "provider_backed";
};

export type CompareQuoteFinding = {
  finding_type:
    | "price_increase"
    | "discount_removed"
    | "sku_changed"
    | "payment_terms_changed"
    | "renewal_term_changed"
    | "auto_renew_risk"
    | "notice_window_risk"
    | "usage_mismatch"
    | "duplicate_vendor_risk"
    | "unfavorable_clause_change";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  current_value?: unknown;
  proposed_value?: unknown;
  delta_value?: unknown;
  confidence: number;
  citation?: {
    source_file_id?: string | null;
    page?: number | null;
    snippet?: string | null;
    evidence_label?: string | null;
  } | null;
};

export type CompareQuoteSavingsOpportunity = {
  opportunity_type: string;
  title: string;
  estimated_savings_amount?: number | null;
  currency?: string | null;
  confidence: number;
  evidence: Record<string, unknown>;
};

export type CompareQuoteResponse = {
  current_total_amount: number | null;
  proposed_total_amount: number | null;
  currency: string | null;
  price_delta_amount: number | null;
  price_delta_percent: number | null;
  overall_risk_level: "unknown" | "info" | "low" | "medium" | "high" | "critical";
  findings: CompareQuoteFinding[];
  savings_opportunities: CompareQuoteSavingsOpportunity[];
  recommendation_summary: string;
  warnings: string[];
};

export type ReconcileUsageRequest = {
  organization_id: string;
  usage_import_batch_id: string;
  matching_mode: "strict" | "balanced" | "exploratory";
  normalized_rows?: Array<{
    usage_row_id: string;
    vendor: string;
    product: string;
    normalized_product: string;
    provider?: "manual_csv" | "microsoft_365" | "google_workspace";
    external_product_id?: string | null;
    category?: string | null;
    annual_reviewed_cost?: number | null;
    currency?: string | null;
    purchased_seats?: number | null;
    assigned_seats?: number | null;
    active_users_30d?: number | null;
    active_users_90d?: number | null;
    last_activity_at?: string | null;
    collected_at?: string | null;
    trust_state?: string | null;
    confidence?: number | null;
    is_sample?: boolean | null;
    department?: string | null;
    warning_codes?: string[];
    evidence_state?: "complete" | "partial" | "missing" | "stale" | "unmapped" | "conflicting";
  }>;
  contract_candidates?: Array<{
    contract_id: string;
    vendor?: string | null;
    title?: string | null;
    renewal_date?: string | null;
    notice_deadline_date?: string | null;
    annual_cost?: number | null;
    currency?: string | null;
    is_sample?: boolean | null;
  }>;
  provider_warning_codes?: string[];
};

export type ReconcileUsageResponse = {
  matched_count: number;
  unmatched_count: number;
  duplicate_candidates: string[];
  waste_opportunities: string[];
  estimated_savings: number;
  findings?: Array<{
    finding_type:
      | "unused_subscription"
      | "low_utilization"
      | "unused_seats"
      | "seat_reduction_candidate"
      | "duplicate_product_contract"
      | "possible_functional_overlap"
      | "high_cost_low_usage"
      | "stale_usage_data"
      | "renewal_decision_required";
    reason_code: string;
    calculation_version: string;
    calculation_family?: string | null;
    source_row_ids: string[];
    matched_contract_ids: string[];
    utilization: number | null;
    unused_seats: number | null;
    confidence: number;
    warnings: string[];
    estimated_savings: number | null;
    currency: string | null;
    recommended_action:
      | "retain"
      | "reduce_seats"
      | "consolidate"
      | "terminate"
      | "renegotiate"
      | "investigate"
      | "insufficient_evidence";
    involved_providers?: string[];
    involved_products?: string[];
    capability_category?: string | null;
    taxonomy_version?: string | null;
    taxonomy_family?: string | null;
    estimated_savings_min?: number | null;
    estimated_savings_max?: number | null;
    evidence?: Record<string, unknown>;
    explanation?: string | null;
    recommended_human_action?: string | null;
    fingerprint_key?: string | null;
  }>;
};

export type ScoreRiskRequest = {
  organization_id: string;
  contract_id: string;
  readiness_context: Record<string, unknown>;
};

export type ScoreRiskResponse = {
  risk_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  risk_factors: string[];
  recommended_actions: string[];
};

function options(overrides: Partial<AddOnClientOptions> = {}): AddOnClientOptions {
  return {
    addOnId: "python_contract_intelligence",
    baseUrl: overrides.baseUrl === undefined ? getAppConfig().addOns.pythonIntelligenceUrl : overrides.baseUrl,
    signingSecret: overrides.signingSecret === undefined ? getAppConfig().addOns.internalSigningSecret : overrides.signingSecret,
    ...overrides
  };
}

export function checkPythonIntelligenceHealth(overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<never, AddOnHealthResponse>({ ...options(overrides), path: "/health", method: "GET" });
}

/**
 * @deprecated Compatibility-only deterministic scaffold. Customer contract
 * extraction must use runFullDocumentContractExtraction so actual scoped bytes,
 * page evidence, OCR fallback, and provider validation cannot be bypassed.
 */
export function extractContract(request: ExtractContractRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<ExtractContractRequest, ExtractContractResponse>({
    ...options(overrides),
    path: "/extract-contract",
    body: request
  });
}

export function compareQuote(request: CompareQuoteRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<CompareQuoteRequest, CompareQuoteResponse>({ ...options(overrides), path: "/compare-quote", body: request });
}

export function reconcileUsage(request: ReconcileUsageRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<ReconcileUsageRequest, ReconcileUsageResponse>({
    ...options(overrides),
    path: "/reconcile-usage",
    body: request
  });
}

export function scoreRisk(request: ScoreRiskRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<ScoreRiskRequest, ScoreRiskResponse>({ ...options(overrides), path: "/score-risk", body: request });
}
