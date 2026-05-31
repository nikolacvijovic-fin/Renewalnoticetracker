import { describe, expect, it } from "vitest";
import {
  buildFinancialIntelligencePageModel,
  buildFinancialIntelligenceViewedAuditPayload
} from "@/lib/intelligence/financial/page-model";
import {
  buildProcurementAnalyticsDashboardQuery,
  buildProcurementAnalyticsPageModel,
  buildProcurementAnalyticsViewedAuditPayload
} from "@/lib/intelligence/procurement/page-model";
import {
  buildRiskQueueContractQueryOptions,
  buildRiskQueuePageModel,
  buildRiskQueueViewedAuditPayload,
  getDuplicateCounterpartyIdsForRiskQueue
} from "@/lib/intelligence/risk/page-model";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";
import type { FinancialDashboardView } from "@/lib/intelligence/financial/dashboard";
import type {
  ProcurementAnalyticsDashboard,
  ProcurementAnalyticsRow,
  ProcurementAnalyticsSummary
} from "@/lib/intelligence/procurement/query-helpers";
import type { RiskQueueView } from "@/lib/intelligence/risk/dashboard";

describe("intelligence dashboard page models", () => {
  it("builds risk queue filters and duplicate-counterparty scope outside the page", () => {
    const contract = {
      id: "contract-1",
      status: "active",
      cycle_status: "awaiting_acknowledgment",
      status_tag: "active",
      owner_user_id: "owner-1",
      owner_name: "Owner One",
      department: "Legal",
      renewal_decision_status: "undecided",
      created_at: "2026-05-16T00:00:00.000Z",
      counterparty_id: "counterparty-1",
      contract_metadata: {
        contract_title: "MSA",
        counterparty_name: "Acme",
        renewal_date: "2099-05-25",
        expiration_date: "2099-06-20",
        notice_deadline_date: "2099-05-20",
        auto_renewal: true,
        needs_review: false,
        field_confidence: 0.95,
        has_weak_evidence: false,
        accepted_unverified_risk_requested: false,
        contract_value_amount: 100000,
        contract_value_currency: "USD",
        contract_value_period: "annual",
        price_change_trigger: null,
        payment_trigger: null,
        financial_data_trust_status: "high"
      }
    } satisfies DashboardContractRow;
    const searchParams = {
      owner: "owner-1",
      department: "Legal",
      riskBand: "critical",
      dueWindow: "30",
      trustStatus: "verified"
    };

    expect(buildRiskQueueContractQueryOptions(searchParams)).toEqual({
      ownerUserId: "owner-1",
      department: "Legal"
    });
    expect(
      getDuplicateCounterpartyIdsForRiskQueue([
        {
          id: "counterparty-1",
          name: "Acme",
          raw_counterparty_name: "Acme",
          normalized_counterparty_name: "acme",
          contract_count: 1,
          alias_names: [],
          duplicate_suggestions: [
            { id: "counterparty-2", raw_counterparty_name: "ACME Inc", score: 88 }
          ]
        },
        {
          id: "counterparty-3",
          name: "Globex",
          raw_counterparty_name: "Globex",
          normalized_counterparty_name: "globex",
          contract_count: 1,
          alias_names: [],
          duplicate_suggestions: []
        }
      ])
    ).toEqual(["counterparty-1"]);

    const pageModel = buildRiskQueuePageModel({
      contracts: [contract],
      facets: {
        owners: [{ user_id: "owner-1", label: "Owner One" }],
        departments: ["Legal"],
        statusTags: ["active"]
      },
      counterparties: [],
      searchParams
    });

    expect(pageModel.filters).toEqual({
      ownerUserId: "owner-1",
      department: "Legal",
      riskBand: "critical",
      dueWindowDays: "30",
      trustStatus: "verified"
    });
    expect(pageModel.filterOptions).toMatchObject({
      owners: [{ user_id: "owner-1", label: "Owner One" }],
      departments: ["Legal"]
    });
  });

  it("builds the risk queue viewed audit payload from rendered queue state", () => {
    const dashboard = {
      rows: [
        {
          riskBand: "critical",
          missingDataWarnings: [{ code: "missing_owner", message: "Missing owner", severity: "warning" }],
          explanationMetadata: {
            calculation_version: "risk_score.v1",
            input_data_version: "trusted_workflow_state.v1",
            trusted_fields_used: [],
            low_confidence_fields_used: [],
            excluded_fields: [],
            warnings: []
          }
        },
        {
          riskBand: "high",
          missingDataWarnings: [],
          explanationMetadata: {
            calculation_version: "risk_score.v1",
            input_data_version: "trusted_workflow_state.v1",
            trusted_fields_used: [],
            low_confidence_fields_used: [],
            excluded_fields: [],
            warnings: []
          }
        }
      ],
      summary: {
        total: 2,
        critical: 1,
        high: 1,
        lowConfidence: 1
      }
    } as unknown as RiskQueueView;

    expect(
      buildRiskQueueViewedAuditPayload({
        organizationId: "org-1",
        actorUserId: "user-1",
        dashboard
      })
    ).toEqual({
      organizationId: "org-1",
      actorUserId: "user-1",
      contractCount: 2,
      lowConfidenceCount: 1,
      riskBandsViewed: ["critical", "high"],
      warningCount: 1,
      calculationVersion: "risk_score.v1",
      inputDataVersion: "trusted_workflow_state.v1"
    });
  });

  it("builds the financial dashboard viewed audit payload from shared dashboard state", () => {
    const view = {
      cards: [
        {
          explanationMetadata: {
            calculation_version: "financial_exposure.v1",
            input_data_version: "trusted_workflow_state.v1",
            trusted_fields_used: [],
            low_confidence_fields_used: [],
            excluded_fields: [],
            warnings: []
          }
        }
      ],
      warnings: [{ code: "low_trust", message: "Low trust", severity: "warning" }],
      lowTrustContractCount: 2
    } as unknown as FinancialDashboardView;

    expect(
      buildFinancialIntelligenceViewedAuditPayload({
        organizationId: "org-1",
        actorUserId: "admin-1",
        contractCount: 4,
        view
      })
    ).toEqual({
      organizationId: "org-1",
      actorUserId: "admin-1",
      contractCount: 4,
      lowTrustContractCount: 2,
      warningCount: 1,
      calculationVersion: "financial_exposure.v1"
    });
  });

  it("builds the financial page model from contracts before rendering or audit", () => {
    const contract = {
      id: "contract-1",
      status: "active",
      cycle_status: "open",
      status_tag: "active",
      owner_user_id: "owner-1",
      owner_name: "Owner One",
      department: "Legal",
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
        financial_data_trust_status: "high"
      }
    } satisfies DashboardContractRow;

    const pageModel = buildFinancialIntelligencePageModel([contract]);

    expect(pageModel.contractCount).toBe(1);
    expect(pageModel.view.cards.length).toBeGreaterThan(0);
    expect(
      buildFinancialIntelligenceViewedAuditPayload({
        organizationId: "org-1",
        actorUserId: "admin-1",
        contractCount: pageModel.contractCount,
        view: pageModel.view
      })
    ).toMatchObject({
      organizationId: "org-1",
      actorUserId: "admin-1",
      contractCount: 1
    });
  });

  it("normalizes procurement dashboard query state outside the page", () => {
    expect(
      buildProcurementAnalyticsDashboardQuery({
        department: "Legal",
        owner: "owner-1",
        counterparty: "Acme",
        dueWindow: "90",
        trustStatus: "low_confidence"
      })
    ).toEqual({
      department: "Legal",
      ownerUserId: "owner-1",
      counterpartyName: "Acme",
      dueWindowDays: 90,
      trustStatus: "low_confidence"
    });

    expect(
      buildProcurementAnalyticsDashboardQuery({
        dueWindow: "not-a-window",
        trustStatus: "not-a-trust-filter"
      })
    ).toEqual({
      department: undefined,
      ownerUserId: undefined,
      counterpartyName: undefined,
      dueWindowDays: null,
      trustStatus: "all"
    });
  });

  it("builds procurement action lists and summary counts from shared dashboard truth", () => {
    const makeRow = (overrides: Partial<ProcurementAnalyticsRow> = {}): ProcurementAnalyticsRow => ({
      key: "row-1",
      label: "Acme",
      contract_count: 3,
      low_confidence_contract_count: 1,
      owner_missing_contract_count: 2,
      decision_gap_contract_count: 2,
      due_soon_contract_count: 2,
      auto_renewal_contract_count: 2,
      drilldown_contract_ids: ["contract-1", "contract-2"],
      trust_level: "low",
      warnings: [
        {
          code: "low_confidence_contracts",
          message: "Low confidence contract present.",
          severity: "warning"
        }
      ],
      exposure_amount: 120000,
      exposure_currency: "USD",
      latest_decision_date: "2026-05-11",
      duplicate_suggestions: [{ id: "counterparty-2", raw_counterparty_name: "ACME Inc", score: 88 }],
      ...overrides
    });
    const makeSummary = (rows: ProcurementAnalyticsRow[]): ProcurementAnalyticsSummary => ({
      slug: "procurement.test",
      title: "Test summary",
      rows,
      total_contract_count: rows.reduce((sum, row) => sum + row.contract_count, 0),
      low_confidence_contract_count: rows.reduce(
        (sum, row) => sum + row.low_confidence_contract_count,
        0
      ),
      warnings: [],
      calculation_basis: {
        slug: "procurement.test",
        description: "Test basis",
        usesReviewedTruthOnly: true,
        blocksWhenTrustGatesFail: true
      }
    });

    const dashboard = {
      totalContractsInScope: 5,
      lowConfidenceContractCount: 1,
      combinedWarnings: [{ code: "low_confidence", message: "Needs review", severity: "warning" }],
      decisionGapSummary: makeSummary([
        makeRow({ key: "decision_gap", contract_count: 4 })
      ]),
      duplicateCounterpartySummary: makeSummary([
        makeRow({ key: "duplicate-1", exposure_amount: null, exposure_currency: null })
      ]),
      vendorExposureSummary: makeSummary([makeRow()]),
      dueSoonVendorConcentration: makeSummary([makeRow({ key: "due-soon-1" })]),
      departmentExposureSummary: makeSummary([
        makeRow({ key: "department-1", label: "Legal" })
      ]),
      ownerCoverageSummary: makeSummary([
        makeRow({ key: "owner-1", label: "Owner One" })
      ]),
      autoRenewalConcentrationSummary: makeSummary([makeRow({ key: "auto-1" })]),
      renewalOutcomeHistory: makeSummary([
        makeRow({ key: "renewed", label: "Renewed", decision_gap_contract_count: 0 })
      ])
    } as unknown as ProcurementAnalyticsDashboard;

    const pageModel = buildProcurementAnalyticsPageModel(dashboard);

    expect(pageModel.summary).toEqual({
      decisionGapCount: 4,
      duplicateCleanupCount: 1
    });
    expect(pageModel.topVendorRows[0]).toMatchObject({
      label: "Acme",
      primaryValue: "$120,000",
      trustLabel: "Low trust",
      href: "/dashboard/contracts?contractIds=contract-1%2Ccontract-2&procurementView=top_vendors_exposure"
    });
    expect(pageModel.duplicateRows[0]).toMatchObject({
      primaryValue: "1 duplicate match",
      secondaryValue: "3 contracts need cleanup",
      actionLabel: "Clean up vendor identity"
    });
    expect(pageModel.autoRenewalRows[0]).toMatchObject({
      primaryValue: "2 auto-renewals",
      secondaryValue: "2 still need a decision"
    });
    expect(
      buildProcurementAnalyticsViewedAuditPayload({
        organizationId: "org-1",
        actorUserId: "operator-1",
        dashboard
      })
    ).toEqual({
      organizationId: "org-1",
      actorUserId: "operator-1",
      contractCount: 5,
      lowConfidenceContractCount: 1,
      warningCount: 1,
      calculationVersion: "procurement_analytics.v1"
    });
  });
});
