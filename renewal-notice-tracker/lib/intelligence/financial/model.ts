import {
  INTELLIGENCE_TRUST_LEVELS,
  type IntelligenceCalculationBasis,
  type IntelligenceExplainabilityMetadata,
  type IntelligenceTrustLevel,
  type IntelligenceWarning
} from "@/lib/intelligence/shared/types";

export const FINANCIAL_VALUE_PERIODS = [
  "one_time",
  "monthly",
  "quarterly",
  "annual",
  "multi_year",
  "unknown"
] as const;

export type FinancialValuePeriod = (typeof FINANCIAL_VALUE_PERIODS)[number];

export type FinancialDataTrustStatus = IntelligenceTrustLevel;

export type FinancialExposureContractInput = {
  contract_id: string;
  contract_value_amount: number | null;
  contract_value_currency: string | null;
  contract_value_period: FinancialValuePeriod | null;
  price_change_trigger: string | null;
  payment_trigger: string | null;
  renewal_date: string | null;
  expiration_date: string | null;
  notice_deadline_date: string | null;
  auto_renewal: boolean | null;
  renewal_term: string | null;
  department: string | null;
  owner_user_id: string | null;
  counterparty_name: string | null;
  decision_status: string | null;
  trust_status: string | null;
  financial_data_trust_status: FinancialDataTrustStatus | null;
};

export type FinancialExposurePolicy = {
  lowTrustValuePolicy?: "exclude" | "include";
  allowLowConfidenceAutoRenewal?: boolean;
};

export type FinancialExposureResult = {
  amount: number | null;
  currency: string | null;
  included_contract_count: number;
  excluded_contract_count: number;
  trust_level: IntelligenceTrustLevel;
  warnings: IntelligenceWarning[];
  calculation_basis: IntelligenceCalculationBasis;
  explanation_metadata: IntelligenceExplainabilityMetadata;
};

export const REVIEW_BLOCKING_TRUST_STATES = [
  "Needs Review",
  "Conflict Requires Review"
] as const;

export function normalizeFinancialCurrencyCode(value: unknown) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return normalized;
}

export function normalizeFinancialValuePeriod(value: unknown): FinancialValuePeriod | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return (FINANCIAL_VALUE_PERIODS as readonly string[]).includes(normalized)
    ? (normalized as FinancialValuePeriod)
    : "unknown";
}

export function normalizeFinancialTrustStatus(
  value: unknown
): FinancialDataTrustStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return (INTELLIGENCE_TRUST_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as FinancialDataTrustStatus)
    : null;
}

export function deriveFinancialDataTrustStatus(input: {
  explicitTrustStatus?: FinancialDataTrustStatus | null;
  needsReview?: boolean | null;
  contractValueAmount?: number | null;
  contractValueCurrency?: string | null;
}) {
  if (input.explicitTrustStatus) return input.explicitTrustStatus;
  if (input.contractValueAmount === null || input.contractValueAmount === undefined) {
    return "blocked" as const;
  }
  if (input.needsReview) return "low" as const;
  if (!input.contractValueCurrency) return "medium" as const;
  return "high" as const;
}

export function getFinancialTrustLevelFromContracts(
  contracts: FinancialExposureContractInput[]
): IntelligenceTrustLevel {
  if (contracts.length === 0) return "blocked";
  if (contracts.some((contract) => contract.financial_data_trust_status === "low")) return "low";
  if (
    contracts.some(
      (contract) =>
        contract.financial_data_trust_status === "medium" ||
        contract.financial_data_trust_status === "blocked"
    )
  ) {
    return "medium";
  }
  return "high";
}
