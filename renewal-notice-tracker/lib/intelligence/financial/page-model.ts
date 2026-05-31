import type { FinancialDashboardView } from "@/lib/intelligence/financial/dashboard";
import { buildFinancialDashboardView } from "@/lib/intelligence/financial/dashboard";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";

export type FinancialIntelligencePageModel = {
  view: FinancialDashboardView;
  contractCount: number;
};

export type FinancialIntelligenceViewedAuditPayload = {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowTrustContractCount: number;
  warningCount: number;
  calculationVersion: string;
};

export function buildFinancialIntelligenceViewedAuditPayload(input: {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  view: FinancialDashboardView;
}): FinancialIntelligenceViewedAuditPayload {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractCount: input.contractCount,
    lowTrustContractCount: input.view.lowTrustContractCount,
    warningCount: input.view.warnings.length,
    calculationVersion:
      input.view.cards[0]?.explanationMetadata.calculation_version ??
      "financial_exposure.v1"
  };
}

export function buildFinancialIntelligencePageModel(
  contracts: DashboardContractRow[]
): FinancialIntelligencePageModel {
  return {
    view: buildFinancialDashboardView(contracts),
    contractCount: contracts.length
  };
}
