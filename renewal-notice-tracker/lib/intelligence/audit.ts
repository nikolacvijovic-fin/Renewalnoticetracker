import { createAuditLog } from "@/lib/audit";

type IntelligenceAuditAction =
  | "intelligence.financial_viewed"
  | "intelligence.procurement_viewed"
  | "intelligence.risk_score_viewed"
  | "intelligence.risk_score_recalculated"
  | "intelligence.export_requested"
  | "intelligence.settings_changed";

async function createIntelligenceAuditLog(input: {
  organizationId: string;
  actorUserId: string;
  action: IntelligenceAuditAction;
  contractId?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractId: input.contractId ?? null,
    action: input.action,
    entityType: "intelligence",
    entityId: input.entityId ?? input.contractId ?? null,
    details: input.details
  });
}

export async function auditFinancialIntelligenceViewed(input: {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowTrustContractCount: number;
  warningCount: number;
  calculationVersion: string;
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "intelligence.financial_viewed",
    details: {
      layer: "financial",
      scope: "dashboard",
      contract_count: input.contractCount,
      low_trust_contract_count: input.lowTrustContractCount,
      warning_count: input.warningCount,
      calculation_version: input.calculationVersion
    }
  });
}

export async function auditProcurementAnalyticsViewed(input: {
  organizationId: string;
  actorUserId: string;
  contractCount: number;
  lowConfidenceContractCount: number;
  warningCount: number;
  calculationVersion: string;
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "intelligence.procurement_viewed",
    details: {
      layer: "procurement",
      scope: "dashboard",
      contract_count: input.contractCount,
      low_confidence_contract_count: input.lowConfidenceContractCount,
      warning_count: input.warningCount,
      calculation_version: input.calculationVersion
    }
  });
}

export async function auditRiskScoreViewed(input: {
  organizationId: string;
  actorUserId: string;
  contractId?: string | null;
  contractCount: number;
  lowConfidenceCount: number;
  riskBandsViewed: string[];
  calculationVersion: string;
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractId: input.contractId ?? null,
    action: "intelligence.risk_score_viewed",
    entityId: input.contractId ?? null,
    details: {
      layer: "risk",
      scope: input.contractId ? "contract" : "queue",
      contract_count: input.contractCount,
      low_confidence_count: input.lowConfidenceCount,
      risk_bands_viewed: input.riskBandsViewed,
      calculation_version: input.calculationVersion
    }
  });
}

export async function auditRiskScoreRecalculated(input: {
  organizationId: string;
  actorUserId: string;
  contractId?: string | null;
  contractCount: number;
  warningCount: number;
  calculationVersion: string;
  inputDataVersion: string;
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    contractId: input.contractId ?? null,
    action: "intelligence.risk_score_recalculated",
    entityId: input.contractId ?? null,
    details: {
      layer: "risk",
      scope: input.contractId ? "contract" : "queue",
      contract_count: input.contractCount,
      warning_count: input.warningCount,
      calculation_version: input.calculationVersion,
      input_data_version: input.inputDataVersion
    }
  });
}

export async function auditIntelligenceExportRequested(input: {
  organizationId: string;
  actorUserId: string;
  exportType: string;
  contractCount: number;
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "intelligence.export_requested",
    details: {
      export_type: input.exportType,
      contract_count: input.contractCount
    }
  });
}

export async function auditIntelligenceSettingsChanged(input: {
  organizationId: string;
  actorUserId: string;
  changedKeys: string[];
}) {
  await createIntelligenceAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "intelligence.settings_changed",
    details: {
      changed_key_count: input.changedKeys.length,
      changed_keys: input.changedKeys
    }
  });
}
