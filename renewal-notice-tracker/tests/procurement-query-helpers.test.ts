import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";
import type {
  CounterpartyRecord,
  RenewalDecisionAnalyticsRecord
} from "@/lib/contracts/kernel-queries";

const getContracts = vi.fn();
const getCounterparties = vi.fn();
const getRenewalDecisionAnalyticsRows = vi.fn();

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContracts,
  getCounterparties,
  getRenewalDecisionAnalyticsRows
}));

function makeContract(
  overrides: Partial<DashboardContractRow> = {},
  metadataOverrides: Partial<NonNullable<DashboardContractRow["contract_metadata"]>> = {}
): DashboardContractRow {
  return {
    id: "contract-1",
    status: "active",
    cycle_status: "open",
    status_tag: "active",
    department: "Legal",
    owner_user_id: "owner-1",
    owner_name: "Owner One",
    counterparty_id: "counterparty-1",
    renewal_decision_status: "undecided",
    created_at: "2026-05-16T00:00:00.000Z",
    contract_metadata: {
      contract_title: "Master Services Agreement",
      counterparty_name: "Acme",
      renewal_date: "2026-06-30",
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

function makeCounterparty(
  overrides: Partial<CounterpartyRecord> = {}
): CounterpartyRecord {
  return {
    id: "counterparty-1",
    name: "Acme",
    raw_counterparty_name: "Acme LLC",
    normalized_counterparty_name: "acme",
    contract_count: 1,
    alias_names: [],
    duplicate_suggestions: [],
    ...overrides
  };
}

function makeDecision(
  overrides: Partial<RenewalDecisionAnalyticsRecord> = {}
): RenewalDecisionAnalyticsRecord {
  return {
    id: "decision-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    status: "renew",
    decision_date: "2026-05-10",
    created_at: "2026-05-10T10:00:00.000Z",
    ...overrides
  };
}

describe("procurement query helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getContracts.mockResolvedValue([]);
    getCounterparties.mockResolvedValue([]);
    getRenewalDecisionAnalyticsRows.mockResolvedValue([]);
  });

  it("excludes cross-org renewal decision rows from outcome history", async () => {
    getContracts.mockResolvedValue([makeContract()]);
    getCounterparties.mockResolvedValue([makeCounterparty()]);
    getRenewalDecisionAnalyticsRows.mockResolvedValue([
      makeDecision(),
      makeDecision({
        id: "decision-foreign",
        organization_id: "org-2",
        contract_id: "foreign-contract",
        status: "terminate"
      })
    ]);

    const { getRenewalOutcomeHistory } = await import(
      "@/lib/intelligence/procurement/query-helpers"
    );
    const result = await getRenewalOutcomeHistory("org-1");

    expect(getContracts).toHaveBeenCalledWith("org-1", "all");
    expect(getCounterparties).toHaveBeenCalledWith("org-1");
    expect(getRenewalDecisionAnalyticsRows).toHaveBeenCalledWith("org-1");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.label).toBe("Renewed");
    expect(result.rows[0]?.drilldown_contract_ids).toEqual(["contract-1"]);
  });

  it("labels unreviewed vendor exposure as low-confidence", async () => {
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract(
        {
          id: "contract-2",
          counterparty_id: "counterparty-2"
        },
        {
          counterparty_name: "Globex",
          needs_review: true,
          financial_data_trust_status: "low"
        }
      )
    ]);
    getCounterparties.mockResolvedValue([
      makeCounterparty(),
      makeCounterparty({
        id: "counterparty-2",
        name: "Globex",
        raw_counterparty_name: "Globex Ltd",
        normalized_counterparty_name: "globex"
      })
    ]);

    const { getVendorExposureSummary } = await import(
      "@/lib/intelligence/procurement/query-helpers"
    );
    const result = await getVendorExposureSummary("org-1");
    const globexRow = result.rows.find((row) => row.label === "Globex");

    expect(globexRow?.low_confidence_contract_count).toBe(1);
    expect(globexRow?.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "low_confidence_contracts" })
      ])
    );
  });

  it("surfaces duplicate counterparties with drilldown contract ids", async () => {
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract({
        id: "contract-2",
        counterparty_id: "counterparty-2"
      })
    ]);
    getCounterparties.mockResolvedValue([
      makeCounterparty({
        duplicate_suggestions: [
          { id: "counterparty-2", raw_counterparty_name: "ACME Incorporated", score: 85 }
        ],
        contract_count: 2
      })
    ]);

    const { getDuplicateCounterpartySummary } = await import(
      "@/lib/intelligence/procurement/query-helpers"
    );
    const result = await getDuplicateCounterpartySummary("org-1");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.duplicate_suggestions).toHaveLength(1);
    expect(result.rows[0]?.drilldown_contract_ids).toEqual(["contract-1"]);
  });

  it("counts owner gaps correctly", async () => {
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract({
        id: "contract-2",
        owner_user_id: null,
        owner_name: "Unassigned"
      })
    ]);

    const { getOwnerCoverageSummary } = await import(
      "@/lib/intelligence/procurement/query-helpers"
    );
    const result = await getOwnerCoverageSummary("org-1");

    const assignedRow = result.rows.find((row) => row.key === "owner:owner-1");
    const missingRow = result.rows.find((row) => row.key === "owner:unassigned");

    expect(assignedRow?.contract_count).toBe(1);
    expect(missingRow?.contract_count).toBe(1);
    expect(missingRow?.owner_missing_contract_count).toBe(1);
    expect(missingRow?.drilldown_contract_ids).toEqual(["contract-2"]);
  });

  it("counts decision gaps correctly", async () => {
    getContracts.mockResolvedValue([
      makeContract(),
      makeContract({
        id: "contract-2",
        renewal_decision_status: "renew"
      }),
      makeContract({
        id: "contract-3",
        renewal_decision_status: "undecided",
        cycle_status: "closed"
      })
    ]);

    const { getDecisionGapSummary } = await import(
      "@/lib/intelligence/procurement/query-helpers"
    );
    const result = await getDecisionGapSummary("org-1");

    const gapRow = result.rows.find((row) => row.key === "decision_gap");
    const decidedRow = result.rows.find((row) => row.key === "decision_recorded");

    expect(gapRow?.contract_count).toBe(1);
    expect(gapRow?.drilldown_contract_ids).toEqual(["contract-1"]);
    expect(decidedRow?.contract_count).toBe(2);
  });
});
