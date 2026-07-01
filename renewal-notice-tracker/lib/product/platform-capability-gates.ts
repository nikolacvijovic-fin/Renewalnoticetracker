import type { ActiveOrganizationContext } from "@/lib/auth";
import type { BillingSnapshot, CommercialAccessResult } from "@/lib/billing/entitlements";
import {
  evaluatePlatformCapabilityRuntime,
  type PlatformCapabilityEvaluationMode,
  type PlatformCapabilityId,
  type PlatformCapabilityRuntimeDecision,
  type PlatformProvider,
  type PlatformRuntimeContext
} from "@/lib/product/platform-orchestration";

export type PlatformCapabilityGateDecision = {
  allowed: boolean;
  capabilityId: PlatformCapabilityId;
  reasonCodes: readonly string[];
  customerSafeMessage: string;
  internalDiagnostics: {
    platformStatus: PlatformCapabilityRuntimeDecision["status"];
    lifecycle: PlatformCapabilityRuntimeDecision["lifecycle"];
    health: PlatformCapabilityRuntimeDecision["health"];
    missingProviders: readonly PlatformProvider[];
    missingFeatureGates: readonly PlatformCapabilityId[];
    dependencyStatuses: readonly {
      capabilityId: PlatformCapabilityId;
      status: PlatformCapabilityRuntimeDecision["status"];
      usable: boolean;
    }[];
  };
  sourceDecisions: {
    platform: PlatformCapabilityRuntimeDecision;
    billing?: CommercialAccessResult;
    permission?: {
      allowed: boolean;
      reasonCode?: string;
    };
    market?: {
      allowed: boolean;
      reasonCode?: string;
    };
  };
};

export class PlatformCapabilityGateError extends Error {
  constructor(public readonly decision: PlatformCapabilityGateDecision) {
    super(decision.customerSafeMessage);
    this.name = "PlatformCapabilityGateError";
  }
}

export const SHIPPED_PLATFORM_FEATURE_GATES: readonly PlatformCapabilityId[] = [
  "billing",
  "contracts",
  "renewals",
  "contract_intelligence",
  "financial_intelligence",
  "procurement_analytics",
  "ocr",
  "ai_generation",
  "exports",
  "notifications",
  "audit",
  "permissions"
] as const;

export const SHIPPED_PLATFORM_PROVIDERS: readonly PlatformProvider[] = [
  "paddle",
  "supabase",
  "openai",
  "resend"
] as const;

export function buildPlatformRuntimeContext(input: {
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  overrides?: Partial<PlatformRuntimeContext>;
}): PlatformRuntimeContext {
  const base: PlatformRuntimeContext = {
    organization: {
      organizationId: input.context.organizationId,
      active: true
    },
    workspace: {
      workspaceId: null,
      activeOrganizationId: input.context.organizationId
    },
    market: {
      marketId: "global",
      runtimeEnabled: true
    },
    identity: {
      actorUserId: input.context.user.id,
      role: input.context.role
    },
    subscription: {
      planTier: input.billingSnapshot.planTier,
      subscriptionStatus: input.billingSnapshot.subscriptionStatus,
      commercialFeatures: []
    },
    providerPolicies: {
      providers: SHIPPED_PLATFORM_PROVIDERS
    },
    featureGates: {
      enabledCapabilities: SHIPPED_PLATFORM_FEATURE_GATES
    },
    approvalContext: {
      approvalRequired: false,
      approvalIds: []
    },
    auditContext: {
      auditBoundary: "customer_truth"
    },
    monitoringContext: {
      health: "healthy"
    }
  };

  return {
    ...base,
    ...input.overrides,
    organization: { ...base.organization, ...input.overrides?.organization },
    workspace: { ...base.workspace, ...input.overrides?.workspace },
    market: { ...base.market, ...input.overrides?.market },
    identity: { ...base.identity, ...input.overrides?.identity },
    subscription: { ...base.subscription, ...input.overrides?.subscription },
    providerPolicies: { ...base.providerPolicies, ...input.overrides?.providerPolicies },
    featureGates: { ...base.featureGates, ...input.overrides?.featureGates },
    approvalContext: { ...base.approvalContext, ...input.overrides?.approvalContext },
    auditContext: { ...base.auditContext, ...input.overrides?.auditContext },
    monitoringContext: { ...base.monitoringContext, ...input.overrides?.monitoringContext }
  };
}

export function evaluatePlatformCapabilityGate(input: {
  capabilityId: PlatformCapabilityId;
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  runtimeContext?: PlatformRuntimeContext;
  runtimeContextOverrides?: Partial<PlatformRuntimeContext>;
  platformMode?: PlatformCapabilityEvaluationMode;
  billingDecision?: CommercialAccessResult;
  permissionDecision?: PlatformCapabilityGateDecision["sourceDecisions"]["permission"];
  marketDecision?: PlatformCapabilityGateDecision["sourceDecisions"]["market"];
}): PlatformCapabilityGateDecision {
  const runtimeContext =
    input.runtimeContext ??
    buildPlatformRuntimeContext({
      context: input.context,
      billingSnapshot: input.billingSnapshot,
      overrides: input.runtimeContextOverrides
    });
  const platform = evaluatePlatformCapabilityRuntime(
    input.capabilityId,
    runtimeContext,
    input.platformMode
  );
  const sourceDecisions: PlatformCapabilityGateDecision["sourceDecisions"] = {
    platform,
    billing: input.billingDecision,
    permission: input.permissionDecision,
    market: input.marketDecision
  };
  const sourceReasonCodes = [
    input.billingDecision && !input.billingDecision.allowed
      ? `billing_${input.billingDecision.reason}`
      : null,
    input.permissionDecision && !input.permissionDecision.allowed
      ? `permission_${input.permissionDecision.reasonCode ?? "denied"}`
      : null,
    input.marketDecision && !input.marketDecision.allowed
      ? `market_${input.marketDecision.reasonCode ?? "denied"}`
      : null
  ].filter((reason): reason is string => Boolean(reason));
  const allowed =
    platform.usable &&
    (input.billingDecision?.allowed ?? true) &&
    (input.permissionDecision?.allowed ?? true) &&
    (input.marketDecision?.allowed ?? true);

  return {
    allowed,
    capabilityId: input.capabilityId,
    reasonCodes: [...platform.reasonCodes, ...sourceReasonCodes],
    customerSafeMessage: allowed
      ? "Capability is available."
      : platform.usable
        ? "This action is not available for the current workspace."
        : platform.customerSafeMessage,
    internalDiagnostics: {
      platformStatus: platform.status,
      lifecycle: platform.lifecycle,
      health: platform.health,
      missingProviders: platform.missingProviders,
      missingFeatureGates: platform.missingFeatureGates,
      dependencyStatuses: platform.dependencyDecisions.map((decision) => ({
        capabilityId: decision.capabilityId,
        status: decision.status,
        usable: decision.usable
      }))
    },
    sourceDecisions
  };
}

export function assertPlatformCapabilityGate(input: Parameters<typeof evaluatePlatformCapabilityGate>[0]) {
  const decision = evaluatePlatformCapabilityGate(input);
  if (!decision.allowed) {
    throw new PlatformCapabilityGateError(decision);
  }
  return decision;
}
