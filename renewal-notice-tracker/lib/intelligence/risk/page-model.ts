import type { RiskQueueView } from "@/lib/intelligence/risk/dashboard";
import { buildRiskQueueView } from "@/lib/intelligence/risk/dashboard";
import type { DashboardContractRow } from "@/lib/contracts/dashboard";
import type {
  ContractFacets,
  CounterpartyRecord
} from "@/lib/contracts/kernel-queries";

export type RiskQueueSearchParams = {
  owner?: string;
  department?: string;
  riskBand?: string;
  dueWindow?: string;
  trustStatus?: string;
};

export type RiskQueueViewedAuditPayload = {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowConfidenceCount: number;
  riskBandsViewed: string[];
  calculationVersion: string;
  inputDataVersion: string;
  warningCount: number;
};

export function buildRiskQueueViewedAuditPayload(input: {
  organizationId: string;
  actorUserId: string;
  dashboard: RiskQueueView;
}): RiskQueueViewedAuditPayload {
  const { dashboard } = input;

  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractCount: dashboard.rows.length,
    lowConfidenceCount: dashboard.summary.lowConfidence,
    riskBandsViewed: Array.from(new Set(dashboard.rows.map((row) => row.riskBand))),
    warningCount: dashboard.rows.reduce(
      (sum, row) => sum + row.missingDataWarnings.length,
      0
    ),
    calculationVersion:
      dashboard.rows[0]?.explanationMetadata.calculation_version ?? "risk_score.v1",
    inputDataVersion:
      dashboard.rows[0]?.explanationMetadata.input_data_version ??
      "trusted_workflow_state.v1"
  };
}

export function buildRiskQueueContractQueryOptions(searchParams: RiskQueueSearchParams) {
  return {
    ownerUserId: searchParams.owner,
    department: searchParams.department
  };
}

export function getDuplicateCounterpartyIdsForRiskQueue(
  counterparties: CounterpartyRecord[]
) {
  return counterparties
    .filter((counterparty) => counterparty.duplicate_suggestions.length > 0)
    .map((counterparty) => counterparty.id);
}

export function buildRiskQueuePageModel(input: {
  contracts: DashboardContractRow[];
  facets: ContractFacets;
  counterparties: CounterpartyRecord[];
  searchParams: RiskQueueSearchParams;
}): RiskQueueView {
  return buildRiskQueueView({
    contracts: input.contracts,
    duplicateCounterpartyIds: getDuplicateCounterpartyIdsForRiskQueue(
      input.counterparties
    ),
    filterOptions: {
      owners: input.facets.owners,
      departments: input.facets.departments
    },
    filters: {
      ownerUserId: input.searchParams.owner,
      department: input.searchParams.department,
      riskBand: input.searchParams.riskBand,
      dueWindowDays: input.searchParams.dueWindow,
      trustStatus: input.searchParams.trustStatus
    }
  });
}
