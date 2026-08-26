import type { Json } from "@/lib/supabase/database.types";

export const COMMERCIAL_EXTRACTION_SCHEMA_VERSION = "commercial_contract_v2";
export const COMMERCIAL_EXTRACTION_PROMPT_VERSION = "commercial_contract_v2_2026-08-26";
export const COMMERCIAL_CALCULATION_VERSION = "commercial_calculation_v2";
export const COMMERCIAL_FINDING_TAXONOMY_VERSION = "commercial_findings_v2";

export const COMMERCIAL_FIELD_CATEGORIES = [
  "contract_identity",
  "term_and_renewal",
  "financial_terms",
  "price_change_mechanics",
  "commercial_protections"
] as const;

export type CommercialFieldCategory = (typeof COMMERCIAL_FIELD_CATEGORIES)[number];

export const COMMERCIAL_FIELD_REGISTRY = {
  contract_title: "contract_identity",
  document_type: "contract_identity",
  vendor_name: "contract_identity",
  customer_party: "contract_identity",
  effective_date: "contract_identity",
  execution_date: "contract_identity",
  governing_agreement_references: "contract_identity",
  amendment_references: "contract_identity",
  governing_law: "contract_identity",
  initial_term: "term_and_renewal",
  expiration_date: "term_and_renewal",
  renewal_date: "term_and_renewal",
  auto_renewal: "term_and_renewal",
  renewal_term: "term_and_renewal",
  notice_period: "term_and_renewal",
  notice_deadline_date: "term_and_renewal",
  termination_for_convenience: "term_and_renewal",
  termination_window: "term_and_renewal",
  termination_for_cause: "term_and_renewal",
  early_termination_fees: "term_and_renewal",
  non_renewal_delivery_method: "term_and_renewal",
  non_renewal_recipient: "term_and_renewal",
  contract_value_amount: "financial_terms",
  contract_value_currency: "financial_terms",
  billing_frequency: "financial_terms",
  payment_terms: "financial_terms",
  payment_timing_trigger: "financial_terms",
  committed_annual_cost: "financial_terms",
  total_committed_cost: "financial_terms",
  minimum_spend: "financial_terms",
  one_time_fees: "financial_terms",
  recurring_fees: "financial_terms",
  unit_prices: "financial_terms",
  quantities: "financial_terms",
  products: "financial_terms",
  discounts: "financial_terms",
  discount_expiration: "financial_terms",
  credits: "financial_terms",
  taxes: "financial_terms",
  automatic_price_increase: "price_change_mechanics",
  price_change_trigger: "price_change_mechanics",
  fixed_uplift_percentage: "price_change_mechanics",
  index_linked_increase: "price_change_mechanics",
  uplift_cap_percentage: "price_change_mechanics",
  price_review_date: "price_change_mechanics",
  vendor_price_change_rights: "price_change_mechanics",
  price_change_notice_requirement: "price_change_mechanics",
  renewal_pricing_basis: "price_change_mechanics",
  service_level_credits: "commercial_protections",
  volume_commitments: "commercial_protections",
  usage_commitments: "commercial_protections",
  take_or_pay_obligations: "commercial_protections",
  exclusivity: "commercial_protections",
  minimum_purchase_obligations: "commercial_protections",
  overage_pricing: "commercial_protections",
  data_export_charges: "commercial_protections",
  transition_charges: "commercial_protections",
  post_termination_assistance_charges: "commercial_protections"
} as const satisfies Record<string, CommercialFieldCategory>;

export type CommercialFieldKey = keyof typeof COMMERCIAL_FIELD_REGISTRY;

export const CRITICAL_COMMERCIAL_FIELDS = new Set<CommercialFieldKey>([
  "renewal_date",
  "expiration_date",
  "notice_deadline_date",
  "auto_renewal",
  "contract_value_amount",
  "contract_value_currency"
]);

export type CommercialCitation = {
  sourceFileId: string;
  pageNumber: number;
  sectionLabel: string | null;
  clauseLabel: string | null;
  snippet: string | null;
  startOffset: number | null;
  endOffset: number | null;
  extractionMethod: "native_pdf" | "docx" | "ocr";
  ocrConfidence: number | null;
};

export type CommercialFieldCandidate = {
  fieldKey: CommercialFieldKey;
  category: CommercialFieldCategory;
  rawValue: Json;
  normalizedValue: Json | null;
  confidence: number;
  citation: CommercialCitation;
  warningCodes: string[];
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
};

export function isCommercialFieldKey(value: string): value is CommercialFieldKey {
  return Object.prototype.hasOwnProperty.call(COMMERCIAL_FIELD_REGISTRY, value);
}

export function categoryForCommercialField(fieldKey: CommercialFieldKey) {
  return COMMERCIAL_FIELD_REGISTRY[fieldKey];
}
