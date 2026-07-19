import { callAddOnJson, type AddOnClientOptions, type AddOnHealthResponse } from "@/lib/add-ons/client-core";
import { getAppConfig } from "@/lib/config";

export type ExtractContractRequest = {
  organization_id: string;
  contract_id: string;
  file_id?: string;
  file_url?: string;
  extraction_mode: "deterministic_scaffold" | "provider_backed";
};

export type ExtractContractResponse = {
  vendor_name: string | null;
  renewal_date: string | null;
  notice_deadline: string | null;
  auto_renew: boolean | null;
  contract_value: number | null;
  currency: string | null;
  extracted_fields: Record<string, unknown>;
  evidence_confidence: number;
  citations: string[];
  warnings: string[];
};

export type CompareQuoteRequest = {
  organization_id: string;
  contract_id: string;
  current_terms: Record<string, unknown>;
  proposed_terms: Record<string, unknown>;
};

export type CompareQuoteResponse = {
  price_delta: number;
  percent_increase: number;
  changed_terms: string[];
  removed_discounts: string[];
  negotiation_flags: string[];
  recommendation: string;
};

export type ReconcileUsageRequest = {
  organization_id: string;
  usage_import_batch_id: string;
  matching_mode: "strict" | "balanced" | "exploratory";
};

export type ReconcileUsageResponse = {
  matched_count: number;
  unmatched_count: number;
  duplicate_candidates: string[];
  waste_opportunities: string[];
  estimated_savings: number;
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
