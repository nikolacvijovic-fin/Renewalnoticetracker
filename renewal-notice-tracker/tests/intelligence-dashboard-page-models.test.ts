import { describe, expect, it } from "vitest";
import { buildFinancialIntelligenceViewedAuditPayload } from "@/lib/intelligence/financial/page-model";
import { buildProcurementAnalyticsPageModel, buildProcurementAnalyticsViewedAuditPayload } from "@/lib/intelligence/procurement/page-model";
import { buildRiskQueueViewedAuditPayload } from "@/lib/intelligence/risk/page-model";
import type { FinancialDashboardView } from "@/lib/intelligence/financial/dashboard";
import type {
  ProcurementAnalyticsDashboard,
  ProcurementAnalyticsRow,
  ProcurementAnalyticsSummary
} from "@/lib/intelligence/procurement/query-helpers";
import type { RiskQueueView } from "@/lib/intelligence/risk/dashboard";

describe("intelligence dashboard page models", () => {
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
