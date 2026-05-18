import { describe, expect, it } from "vitest";
import {
  calculateAutoRenewalExposure,
  calculatePriceChangeExposure,
  calculateRenewalExposure,
  calculateUndecidedExposure,
  calculateUnownedExposure,
  calculateUnreviewedExposure
} from "@/lib/intelligence/financial/exposure";
import type { FinancialExposureContractInput } from "@/lib/intelligence/financial/model";

function makeContract(
  overrides: Partial<FinancialExposureContractInput> = {}
): FinancialExposureContractInput {
  return {
    contract_id: "contract-1",
    contract_value_amount: 100000,
    contract_value_currency: "USD",
    contract_value_period: "annual",
    price_change_trigger: null,
    payment_trigger: null,
    renewal_date: "2026-12-31",
    expiration_date: null,
    notice_deadline_date: "2026-10-01",
    auto_renewal: true,
    renewal_term: "Annual",
    department: "Procurement",
    owner_user_id: "owner-1",
    counterparty_name: "Acme",
    decision_status: "undecided",
    trust_status: "Verified",
    financial_data_trust_status: "high",
    ...overrides
  };
}

describe("financial exposure helpers", () => {
  it("includes reviewed contracts as high-trust renewal exposure", () => {
    const result = calculateRenewalExposure([
      makeContract(),
      makeContract({
        contract_id: "contract-2",
        contract_value_amount: 50000,
        notice_deadline_date: null,
        expiration_date: "2027-01-31"
      })
    ]);

    expect(result.amount).toBe(150000);
    expect(result.currency).toBe("USD");
    expect(result.included_contract_count).toBe(2);
    expect(result.excluded_contract_count).toBe(0);
    expect(result.trust_level).toBe("high");
    expect(result.calculation_basis.usesReviewedTruthOnly).toBe(true);
    expect(result.explanation_metadata.calculation_version).toBe("financial_exposure.v1");
    expect(result.explanation_metadata.trusted_fields_used).toEqual(
      expect.arrayContaining([
        "contract_value_amount",
        "contract_value_currency",
        "notice_deadline_date",
        "expiration_date"
      ])
    );
  });

  it("includes unreviewed imported values only when low-trust inclusion policy is enabled", () => {
    const contract = makeContract({
      trust_status: "Needs Review",
      financial_data_trust_status: "low"
    });

    const excluded = calculateRenewalExposure([contract]);
    expect(excluded.amount).toBeNull();
    expect(excluded.included_contract_count).toBe(0);
    expect(excluded.excluded_contract_count).toBe(1);
    expect(excluded.warnings[0]?.code).toBe("low_trust_excluded");

    const included = calculateRenewalExposure([contract], {
      lowTrustValuePolicy: "include"
    });
    expect(included.amount).toBe(100000);
    expect(included.included_contract_count).toBe(1);
    expect(included.trust_level).toBe("low");
    expect(included.warnings[0]?.code).toBe("low_trust_included");
  });

  it("creates warnings when contract value is missing", () => {
    const result = calculateRenewalExposure([
      makeContract({
        contract_value_amount: null
      })
    ]);

    expect(result.amount).toBeNull();
    expect(result.included_contract_count).toBe(0);
    expect(result.excluded_contract_count).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_contract_value" })
      ])
    );
    expect(result.explanation_metadata.excluded_fields).toContain("contract_value_amount");
  });

  it("does not sum multi-currency values without a conversion policy", () => {
    const result = calculateRenewalExposure([
      makeContract({ contract_value_currency: "USD" }),
      makeContract({
        contract_id: "contract-2",
        contract_value_amount: 80000,
        contract_value_currency: "EUR"
      })
    ]);

    expect(result.amount).toBeNull();
    expect(result.currency).toBeNull();
    expect(result.included_contract_count).toBe(0);
    expect(result.excluded_contract_count).toBe(2);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "multi_currency_without_conversion" })
      ])
    );
  });

  it("excludes contracts without confirmed auto-renewal unless low-confidence inclusion is enabled", () => {
    const lowConfidenceAutoRenew = makeContract({
      auto_renewal: null,
      trust_status: "Needs Review",
      financial_data_trust_status: "low"
    });

    const excluded = calculateAutoRenewalExposure([lowConfidenceAutoRenew], {
      lowTrustValuePolicy: "include"
    });
    expect(excluded.amount).toBeNull();
    expect(excluded.included_contract_count).toBe(0);

    const included = calculateAutoRenewalExposure([lowConfidenceAutoRenew], {
      lowTrustValuePolicy: "include",
      allowLowConfidenceAutoRenewal: true
    });
    expect(included.amount).toBe(100000);
    expect(included.trust_level).toBe("low");
  });

  it("calculates focused exposure slices from trusted workflow state", () => {
    const contracts = [
      makeContract({ owner_user_id: null }),
      makeContract({
        contract_id: "contract-2",
        decision_status: "renew",
        price_change_trigger: "Annual CPI adjustment"
      }),
      makeContract({
        contract_id: "contract-3",
        trust_status: "Needs Review",
        financial_data_trust_status: "low"
      })
    ];

    expect(calculateUnownedExposure(contracts).included_contract_count).toBe(1);
    expect(
      calculateUndecidedExposure(contracts, { lowTrustValuePolicy: "include" }).included_contract_count
    ).toBe(2);
    expect(
      calculateUnreviewedExposure(contracts, { lowTrustValuePolicy: "include" }).included_contract_count
    ).toBe(1);
    expect(calculatePriceChangeExposure(contracts).included_contract_count).toBe(1);
  });
});
