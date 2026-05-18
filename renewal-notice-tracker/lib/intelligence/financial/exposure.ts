import type {
  IntelligenceCalculationBasis,
  IntelligenceWarning
} from "@/lib/intelligence/shared/types";
import {
  type FinancialExposureContractInput,
  type FinancialExposurePolicy,
  type FinancialExposureResult,
  REVIEW_BLOCKING_TRUST_STATES,
  getFinancialTrustLevelFromContracts
} from "@/lib/intelligence/financial/model";

type SelectionResult = {
  included: FinancialExposureContractInput[];
  excluded: FinancialExposureContractInput[];
  warnings: IntelligenceWarning[];
  excludedFields: string[];
};

const FINANCIAL_CALCULATION_VERSION = "financial_exposure.v1";
const FINANCIAL_INPUT_DATA_VERSION = "trusted_workflow_state.v1";

function buildCalculationBasis(
  slug: string,
  description: string
): IntelligenceCalculationBasis {
  return {
    slug,
    description,
    usesReviewedTruthOnly: true,
    blocksWhenTrustGatesFail: true
  };
}

function createWarning(
  code: string,
  message: string,
  severity: "info" | "warning" | "critical" = "warning"
): IntelligenceWarning {
  return { code, message, severity };
}

function hasBlockedWorkflowTrust(contract: FinancialExposureContractInput) {
  return REVIEW_BLOCKING_TRUST_STATES.includes(
    (contract.trust_status ?? "") as (typeof REVIEW_BLOCKING_TRUST_STATES)[number]
  );
}

function selectContracts(
  contracts: FinancialExposureContractInput[],
  predicate: (contract: FinancialExposureContractInput) => boolean,
  policy: FinancialExposurePolicy
): SelectionResult {
  const warnings: IntelligenceWarning[] = [];
  const included: FinancialExposureContractInput[] = [];
  const excluded: FinancialExposureContractInput[] = [];
  const excludedFields = new Set<string>();
  const lowTrustPolicy = policy.lowTrustValuePolicy ?? "exclude";

  for (const contract of contracts) {
    if (!predicate(contract)) {
      excluded.push(contract);
      continue;
    }

    if (contract.contract_value_amount === null || contract.contract_value_amount === undefined) {
      excluded.push(contract);
      excludedFields.add("contract_value_amount");
      warnings.push(
        createWarning(
          "missing_contract_value",
          `Contract ${contract.contract_id} has no contract value and was excluded.`
        )
      );
      continue;
    }

    if (!contract.contract_value_currency) {
      excluded.push(contract);
      excludedFields.add("contract_value_currency");
      warnings.push(
        createWarning(
          "missing_currency",
          `Contract ${contract.contract_id} has no currency and was excluded.`
        )
      );
      continue;
    }

    if (hasBlockedWorkflowTrust(contract)) {
      if (lowTrustPolicy === "include") {
        included.push({
          ...contract,
          financial_data_trust_status: "low"
        });
        warnings.push(
          createWarning(
            "low_trust_included",
            `Contract ${contract.contract_id} is unreviewed and was included as low-trust by policy.`,
            "warning"
          )
        );
      } else {
        excluded.push(contract);
        excludedFields.add("trust_status");
        excludedFields.add("financial_data_trust_status");
        warnings.push(
          createWarning(
            "low_trust_excluded",
            `Contract ${contract.contract_id} is unreviewed and was excluded by policy.`,
            "warning"
          )
        );
      }
      continue;
    }

    included.push(contract);
  }

  const currencies = new Set(
    included.map((contract) => contract.contract_value_currency).filter(Boolean)
  );

  if (currencies.size > 1) {
    return {
      included: [],
      excluded: [...excluded, ...included],
      warnings: [
        ...warnings,
        createWarning(
          "multi_currency_without_conversion",
          "Contracts span multiple currencies and were excluded because no conversion policy exists.",
          "critical"
        )
      ],
      excludedFields: [...excludedFields, "contract_value_currency"]
    };
  }

  return { included, excluded, warnings, excludedFields: [...excludedFields] };
}

function finalizeExposureResult(
  selected: SelectionResult,
  slug: string,
  description: string,
  fieldsUsed: string[]
): FinancialExposureResult {
  const currency =
    selected.included.length > 0
      ? selected.included[0]?.contract_value_currency ?? null
      : null;
  const amount =
    selected.included.length > 0
      ? selected.included.reduce(
          (sum, contract) => sum + (contract.contract_value_amount ?? 0),
          0
        )
      : null;

  return {
    amount,
    currency,
    included_contract_count: selected.included.length,
    excluded_contract_count: selected.excluded.length,
    trust_level: getFinancialTrustLevelFromContracts(selected.included),
    warnings: selected.warnings,
    calculation_basis: buildCalculationBasis(slug, description),
    explanation_metadata: buildExplainabilityMetadata(selected, fieldsUsed)
  };
}

function buildExplainabilityMetadata(
  selected: SelectionResult,
  fieldsUsed: string[]
) {
  const trustedFields = new Set<string>(fieldsUsed);
  const lowConfidenceFields = new Set<string>();
  const excludedFields = new Set<string>(selected.excludedFields);

  for (const contract of selected.included) {
    const target =
      contract.financial_data_trust_status === "low" || hasBlockedWorkflowTrust(contract)
        ? lowConfidenceFields
        : trustedFields;

    target.add("contract_value_amount");
    if (contract.contract_value_currency) {
      target.add("contract_value_currency");
    } else {
      excludedFields.add("contract_value_currency");
    }

    if (contract.notice_deadline_date) trustedFields.add("notice_deadline_date");
    if (contract.renewal_date) trustedFields.add("renewal_date");
    if (contract.expiration_date) trustedFields.add("expiration_date");
    if (contract.auto_renewal !== null) trustedFields.add("auto_renewal");
    if (contract.owner_user_id !== null) trustedFields.add("owner_user_id");
    if (contract.decision_status) trustedFields.add("decision_status");
    if (contract.price_change_trigger) trustedFields.add("price_change_trigger");
    if (contract.payment_trigger) trustedFields.add("payment_trigger");

    if (target === lowConfidenceFields) {
      if (contract.notice_deadline_date) lowConfidenceFields.add("notice_deadline_date");
      if (contract.renewal_date) lowConfidenceFields.add("renewal_date");
      if (contract.expiration_date) lowConfidenceFields.add("expiration_date");
    }
  }

  for (const contract of selected.excluded) {
    if (!contract.contract_value_amount && contract.contract_value_amount !== 0) {
      excludedFields.add("contract_value_amount");
    }
    if (!contract.contract_value_currency) {
      excludedFields.add("contract_value_currency");
    }
    if (hasBlockedWorkflowTrust(contract)) {
      excludedFields.add("trust_status");
      excludedFields.add("financial_data_trust_status");
    }
  }

  return {
    calculation_version: FINANCIAL_CALCULATION_VERSION,
    input_data_version: FINANCIAL_INPUT_DATA_VERSION,
    trusted_fields_used: [...trustedFields].sort(),
    low_confidence_fields_used: [...lowConfidenceFields].sort(),
    excluded_fields: [...excludedFields].sort(),
    warnings: selected.warnings
  };
}

export function calculateRenewalExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = {}
) {
  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) =>
        Boolean(
          contract.notice_deadline_date ||
            contract.renewal_date ||
            contract.expiration_date
        ),
      policy
    ),
    "financial.calculate_renewal_exposure",
    "Sums valued contracts with trusted renewal-control dates. Unreviewed values follow the configured low-trust policy.",
    [
      "contract_value_amount",
      "contract_value_currency",
      "notice_deadline_date",
      "renewal_date",
      "expiration_date"
    ]
  );
}

export function calculateAutoRenewalExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = {}
) {
  const allowLowConfidence = policy.allowLowConfidenceAutoRenewal === true;

  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) => {
        if (contract.auto_renewal === true) return true;
        if (
          allowLowConfidence &&
          contract.auto_renewal === null &&
          contract.financial_data_trust_status === "low"
        ) {
          return true;
        }
        return false;
      },
      policy
    ),
    "financial.calculate_auto_renewal_exposure",
    "Sums valued contracts with confirmed auto-renewal. Unconfirmed auto-renewal stays excluded unless low-confidence inclusion is explicitly enabled.",
    ["contract_value_amount", "contract_value_currency", "auto_renewal"]
  );
}

export function calculateUnownedExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = {}
) {
  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) => !contract.owner_user_id,
      policy
    ),
    "financial.calculate_unowned_exposure",
    "Sums valued contracts that have no assigned owner.",
    ["contract_value_amount", "contract_value_currency", "owner_user_id"]
  );
}

export function calculateUndecidedExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = {}
) {
  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) => (contract.decision_status ?? "undecided") === "undecided",
      policy
    ),
    "financial.calculate_undecided_exposure",
    "Sums valued contracts whose renewal decision is still undecided.",
    ["contract_value_amount", "contract_value_currency", "decision_status"]
  );
}

export function calculateUnreviewedExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = { lowTrustValuePolicy: "include" }
) {
  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) => hasBlockedWorkflowTrust(contract),
      {
        lowTrustValuePolicy: policy.lowTrustValuePolicy ?? "include",
        allowLowConfidenceAutoRenewal: policy.allowLowConfidenceAutoRenewal
      }
    ),
    "financial.calculate_unreviewed_exposure",
    "Sums valued contracts that remain outside reviewed workflow truth, subject to low-trust inclusion policy.",
    [
      "contract_value_amount",
      "contract_value_currency",
      "trust_status",
      "financial_data_trust_status"
    ]
  );
}

export function calculatePriceChangeExposure(
  contracts: FinancialExposureContractInput[],
  policy: FinancialExposurePolicy = {}
) {
  return finalizeExposureResult(
    selectContracts(
      contracts,
      (contract) => Boolean(contract.price_change_trigger),
      policy
    ),
    "financial.calculate_price_change_exposure",
    "Sums valued contracts that carry a reviewed price-change trigger.",
    ["contract_value_amount", "contract_value_currency", "price_change_trigger"]
  );
}
