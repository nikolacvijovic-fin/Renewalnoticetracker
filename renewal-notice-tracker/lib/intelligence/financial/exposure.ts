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
};

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
  const lowTrustPolicy = policy.lowTrustValuePolicy ?? "exclude";

  for (const contract of contracts) {
    if (!predicate(contract)) {
      excluded.push(contract);
      continue;
    }

    if (contract.contract_value_amount === null || contract.contract_value_amount === undefined) {
      excluded.push(contract);
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
      ]
    };
  }

  return { included, excluded, warnings };
}

function finalizeExposureResult(
  selected: SelectionResult,
  slug: string,
  description: string
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
    calculation_basis: buildCalculationBasis(slug, description)
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
    "Sums valued contracts with trusted renewal-control dates. Unreviewed values follow the configured low-trust policy."
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
    "Sums valued contracts with confirmed auto-renewal. Unconfirmed auto-renewal stays excluded unless low-confidence inclusion is explicitly enabled."
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
    "Sums valued contracts that have no assigned owner."
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
    "Sums valued contracts whose renewal decision is still undecided."
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
    "Sums valued contracts that remain outside reviewed workflow truth, subject to low-trust inclusion policy."
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
    "Sums valued contracts that carry a reviewed price-change trigger."
  );
}
