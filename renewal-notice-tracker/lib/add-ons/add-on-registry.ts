export type AddOnRuntime = "typescript" | "python" | "go" | "java" | "sql";

export type AddOnCategory =
  | "intelligence"
  | "reliability"
  | "enterprise_integration"
  | "optimization"
  | "reporting"
  | "data_backbone";

export type AddOnStatus = "planned" | "scaffolded" | "active" | "disabled";

export type AddOnRiskLevel = "low" | "medium" | "high";

export type AddOnManifest = {
  id: string;
  name: string;
  category: AddOnCategory;
  runtime: AddOnRuntime;
  status: AddOnStatus;
  requiredEntitlement: string;
  inputContract: string;
  outputContract: string;
  healthCheckPath: string | null;
  documentationHref: string;
  commercialValue: string;
  riskLevel: AddOnRiskLevel;
};

export type AddOnExecutionResult<TOutput = unknown> =
  | {
      ok: true;
      addOnId: string;
      output: TOutput;
      correlationId: string;
    }
  | {
      ok: false;
      addOnId: string;
      errorCode: "add_on_disabled" | "missing_entitlement" | "not_configured" | "timeout" | "transport_error";
      safeMessage: string;
      correlationId: string;
    };

export const ADD_ON_MANIFESTS = [
  {
    id: "python_contract_intelligence",
    name: "Python Contract Intelligence",
    category: "intelligence",
    runtime: "python",
    status: "scaffolded",
    requiredEntitlement: "intelligence.contract_extraction",
    inputContract: "PythonIntelligenceRequest",
    outputContract: "PythonIntelligenceResponse",
    healthCheckPath: "/health",
    documentationHref: "/docs/add-on-architecture#python-intelligence",
    commercialValue: "Extraction, quote comparison, usage reconciliation, and deterministic risk scoring scaffolds.",
    riskLevel: "high"
  },
  {
    id: "subscription_usage_optimization",
    name: "Subscription Usage Optimization",
    category: "optimization",
    runtime: "python",
    status: "scaffolded",
    requiredEntitlement: "subscription_usage_optimization",
    inputContract: "SubscriptionUsageReconcileRequest",
    outputContract: "SubscriptionUsageReconcileResponse",
    healthCheckPath: "/health",
    documentationHref: "/docs/add-on-architecture#subscription-usage-optimization",
    commercialValue: "CSV-first reviewable savings findings for unused seats, low utilization, stale usage, and duplicate/overlap candidates before renewal.",
    riskLevel: "high"
  },
  {
    id: "go_reliability_worker",
    name: "Go Reliability Worker",
    category: "reliability",
    runtime: "go",
    status: "scaffolded",
    requiredEntitlement: "reliability.reminder_worker",
    inputContract: "GoWorkerJobRequest",
    outputContract: "GoWorkerJobResult",
    healthCheckPath: "/health",
    documentationHref: "/docs/add-on-architecture#go-worker",
    commercialValue: "Reliable idempotent background processing for reminders, imports, webhooks, and audit events.",
    riskLevel: "medium"
  },
  {
    id: "java_enterprise_connectors",
    name: "Java Enterprise Connectors",
    category: "enterprise_integration",
    runtime: "java",
    status: "scaffolded",
    requiredEntitlement: "enterprise.connectors",
    inputContract: "EnterpriseConnectorRequest",
    outputContract: "EnterpriseConnectorResult",
    healthCheckPath: "/health",
    documentationHref: "/docs/add-on-architecture#java-enterprise-connectors",
    commercialValue: "Optional enterprise integration boundary for procurement, identity, approval, and compliance systems.",
    riskLevel: "high"
  },
  {
    id: "postgres_reporting_backbone",
    name: "Postgres Reporting Backbone",
    category: "data_backbone",
    runtime: "sql",
    status: "active",
    requiredEntitlement: "core.reporting_backbone",
    inputContract: "OrgScopedReportingQuery",
    outputContract: "OrgScopedReportingView",
    healthCheckPath: null,
    documentationHref: "/docs/add-on-architecture#sql-postgres-backbone",
    commercialValue: "Tenant-scoped audit, import, usage reconciliation, readiness, owner accountability, and spend-at-risk structures.",
    riskLevel: "medium"
  }
] as const satisfies readonly AddOnManifest[];

export type AddOnId = (typeof ADD_ON_MANIFESTS)[number]["id"];

export function listAddOns(input: { includeDisabled?: boolean } = {}): AddOnManifest[] {
  return (ADD_ON_MANIFESTS as readonly AddOnManifest[]).filter(
    (addOn) => input.includeDisabled || addOn.status !== "disabled"
  );
}

export function getAddOnManifest(addOnId: string): AddOnManifest | null {
  return (ADD_ON_MANIFESTS as readonly AddOnManifest[]).find((addOn) => addOn.id === addOnId) ?? null;
}

export function listAddOnsForEntitlements(entitlements: Iterable<string>) {
  const entitlementSet = new Set(entitlements);
  return listAddOns().filter((addOn) => entitlementSet.has(addOn.requiredEntitlement));
}

export function canExecuteAddOn(input: {
  addOnId: string;
  entitlements: Iterable<string>;
  healthy?: boolean;
}) {
  const manifest = getAddOnManifest(input.addOnId);
  if (!manifest || manifest.status === "disabled") {
    return {
      allowed: false,
      reason: "add_on_disabled" as const,
      manifest
    };
  }

  if (manifest.status === "planned") {
    return {
      allowed: false,
      reason: "add_on_disabled" as const,
      manifest
    };
  }

  if (!new Set(input.entitlements).has(manifest.requiredEntitlement)) {
    return {
      allowed: false,
      reason: "missing_entitlement" as const,
      manifest
    };
  }

  if (input.healthy === false) {
    return {
      allowed: false,
      reason: "not_configured" as const,
      manifest
    };
  }

  return {
    allowed: true,
    reason: "allowed" as const,
    manifest
  };
}
