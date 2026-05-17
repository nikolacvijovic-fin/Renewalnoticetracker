import { describe, expect, it } from "vitest";
import {
  buildFinancialDashboardView,
  filterContractsForFinancialDrilldown
} from "@/lib/intelligence/financial/dashboard";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

function makeContract(
  overrides: Partial<DashboardContractRow> = {},
  metadataOverrides: Partial<NonNullable<DashboardContractRow["contract_metadata"]>> = {}
): DashboardContractRow {
  return {
    id: "contract-1",
    status: "active",
    cycle_status: "open",
    status_tag: "active",
    owner_user_id: "owner-1",
    owner_name: "Alex Owner",
    department: "Procurement",
    renewal_decision_status: "undecided",
    created_at: "2026-05-16T00:00:00.000Z",
    contract_metadata: {
      contract_title: "MSA",
      counterparty_name: "Acme",
      renewal_date: "2026-06-15",
      expiration_date: null,
      notice_deadline_date: "2026-06-01",
      auto_renewal: true,
      needs_review: false,
      field_confidence: 0.95,
      contract_value_amount: 100000,
      contract_value_currency: "USD",
      contract_value_period: "annual",
      price_change_trigger: null,
      payment_trigger: null,
      financial_data_trust_status: "high",
      ...metadataOverrides
    },
    ...overrides
  };
}

describe("financial dashboard helpers", () => {
  it("renders only the allowed Phase 1 financial cards", () => {
    const view = buildFinancialDashboardView([makeContract()]);

    expect(view.cards.map((card) => card.slug)).toEqual([
      "renewal_exposure_30_days",
      "renewal_exposure_60_days",
      "renewal_exposure_90_days",
      "renewal_exposure_180_days",
      "auto_renewal_exposure",
      "unowned_exposure",
      "undecided_exposure",
      "unreviewed_exposure",
      "price_change_exposure"
    ]);
  });

  it("labels low-trust exposure and blocks unsupported currency aggregation", () => {
    const lowTrustView = buildFinancialDashboardView([
      makeContract(
        {},
        {
          needs_review: true,
          financial_data_trust_status: "low"
        }
      )
    ]);

    expect(lowTrustView.cards.find((card) => card.slug === "unreviewed_exposure")?.trustLabel).toBe(
      "Low trust"
    );

    const blockedView = buildFinancialDashboardView([
      makeContract(),
      makeContract(
        {
          id: "contract-2"
        },
        {
          contract_value_currency: "EUR"
        }
      )
    ]);

    const renewal60 = blockedView.cards.find((card) => card.slug === "renewal_exposure_60_days");
    expect(renewal60?.valueLabel).toBe("Blocked");
    expect(renewal60?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "multi_currency_without_conversion" })
      ])
    );
  });

  it("filters contract drilldowns without widening beyond the requested financial slice", () => {
    const contracts = [
      makeContract(),
      makeContract(
        {
          id: "contract-2"
        },
        {
          counterparty_name: "Globex"
        }
      ),
      makeContract(
        {
          id: "contract-3",
          owner_user_id: null,
          owner_name: "Unassigned"
        },
        {
          auto_renewal: false,
          counterparty_name: "Initech"
        }
      )
    ];

    expect(
      filterContractsForFinancialDrilldown(contracts, {
        financialView: "renewal_exposure",
        counterpartyName: "Acme"
      })
    ).toHaveLength(1);
    expect(
      filterContractsForFinancialDrilldown(contracts, {
        financialView: "unowned_exposure",
        unassignedOwner: "1"
      })
    ).toHaveLength(1);
  });
});
