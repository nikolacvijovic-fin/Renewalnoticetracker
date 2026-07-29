import type { ActiveOrganizationContext } from "@/lib/auth";
import {
  getFeatureAccessResult,
  type BillingSnapshot,
  type CommercialAccessResult,
  type CommercialFeature
} from "@/lib/billing/entitlements";
import type { BillingProviderName } from "@/lib/billing/types";
import { canSelfServeActivateMarket, getMarketProfile } from "@/lib/product/market-profiles";
import {
  PLATFORM_CAPABILITIES,
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
  "revenue_intelligence_command_center",
  "ocr",
  "exports",
  "notifications",
  "audit",
  "permissions"
] as const;

export const SHIPPED_CORE_PLATFORM_PROVIDERS: readonly PlatformProvider[] = ["supabase"] as const;

export type PlatformProviderAvailability = Partial<Record<PlatformProvider, boolean>>;

export type PlatformRuntimeContextResolverInput = {
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  workspace?: {
    workspaceId?: string | null;
    activeOrganizationId?: string | null;
  };
  organization?: {
    active?: boolean;
    marketId?: string | null;
  };
  market?: {
    marketId?: string | null;
    runtimeEnabled?: boolean;
  };
  providerAvailability?: PlatformProviderAvailability;
  featureGates?: readonly PlatformCapabilityId[];
  monitoring?: {
    health?: PlatformRuntimeContext["monitoringContext"]["health"];
  };
  approvalContext?: PlatformRuntimeContext["approvalContext"];
  auditRequestId?: string | null;
  auditBoundary?: PlatformRuntimeContext["auditContext"]["auditBoundary"];
  runtimeContextOverrides?: Partial<PlatformRuntimeContext>;
};

const COMMERCIAL_FEATURES = [
  "exports",
  "manual_contracts",
  "multi_recipient_reminders",
  "risk_badges",
  "risk_scores",
  "financial_intelligence",
  "procurement_analytics",
  "intelligence_settings"
] as const satisfies readonly CommercialFeature[];

function mapBillingProviderToPlatformProvider(
  provider: BillingSnapshot["billingProvider"] | BillingProviderName | "none"
): PlatformProvider | null {
  if (provider === "paddle") return "paddle";
  if (provider === "manual") return "manual_invoice";
  if (provider === "paypal") return "paypal_exception";
  return null;
}

export function resolveCommercialFeaturesFromBillingSnapshot(
  billingSnapshot: BillingSnapshot
): readonly CommercialFeature[] {
  return COMMERCIAL_FEATURES.filter((feature) => getFeatureAccessResult(billingSnapshot, feature).allowed);
}

export function resolvePlatformProviders(input: {
  billingSnapshot: BillingSnapshot;
  providerAvailability?: PlatformProviderAvailability;
}): readonly PlatformProvider[] {
  const providers = new Set<PlatformProvider>();
  for (const provider of SHIPPED_CORE_PLATFORM_PROVIDERS) {
    if (input.providerAvailability?.[provider] ?? true) {
      providers.add(provider);
    }
  }

  const billingProvider = mapBillingProviderToPlatformProvider(input.billingSnapshot.billingProvider);
  if (billingProvider && (input.providerAvailability?.[billingProvider] ?? true)) {
    providers.add(billingProvider);
  }

  for (const provider of ["openai", "resend"] as const) {
    if (input.providerAvailability?.[provider] ?? true) {
      providers.add(provider);
    }
  }

  for (const [provider, available] of Object.entries(input.providerAvailability ?? {}) as [
    PlatformProvider,
    boolean
  ][]) {
    if (available && provider !== "future_identity_provider" && provider !== "future_public_api_provider") {
      providers.add(provider);
    }
  }

  return [...providers];
}

export function resolveShippedPlatformFeatureGates(input: {
  enabledCapabilities?: readonly PlatformCapabilityId[];
} = {}): readonly PlatformCapabilityId[] {
  if (input.enabledCapabilities) return input.enabledCapabilities;

  return SHIPPED_PLATFORM_FEATURE_GATES.filter((capabilityId) => {
    const capability = PLATFORM_CAPABILITIES[capabilityId];
    return capability.lifecycle === "generally_available" || capability.lifecycle === "customer_preview";
  });
}

export function resolvePlatformMarketRuntime(input: {
  marketId?: string | null;
  runtimeEnabledOverride?: boolean;
}) {
  const profile = getMarketProfile(input.marketId ?? "global");
  const activation = canSelfServeActivateMarket(profile.marketId);
  return {
    marketId: profile.marketId,
    runtimeEnabled: input.runtimeEnabledOverride ?? activation.allowed,
    decision: activation
  };
}

export function buildPlatformRuntimeContext(input: {
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  overrides?: Partial<PlatformRuntimeContext>;
}): PlatformRuntimeContext {
  return resolvePlatformRuntimeContext({
    context: input.context,
    billingSnapshot: input.billingSnapshot,
    runtimeContextOverrides: input.overrides
  });
}

export function resolvePlatformRuntimeContext(input: PlatformRuntimeContextResolverInput): PlatformRuntimeContext {
  const market = resolvePlatformMarketRuntime({
    marketId: input.market?.marketId ?? input.organization?.marketId ?? "global",
    runtimeEnabledOverride: input.market?.runtimeEnabled
  });
  const base: PlatformRuntimeContext = {
    organization: {
      organizationId: input.context.organizationId,
      active: input.organization?.active ?? true
    },
    workspace: {
      workspaceId: input.workspace?.workspaceId ?? null,
      activeOrganizationId: input.workspace?.activeOrganizationId ?? input.context.organizationId
    },
    market: {
      marketId: market.marketId,
      runtimeEnabled: market.runtimeEnabled
    },
    identity: {
      actorUserId: input.context.user.id,
      role: input.context.role
    },
    subscription: {
      planTier: input.billingSnapshot.planTier,
      subscriptionStatus: input.billingSnapshot.subscriptionStatus,
      commercialFeatures: resolveCommercialFeaturesFromBillingSnapshot(input.billingSnapshot)
    },
    providerPolicies: {
      providers: resolvePlatformProviders({
        billingSnapshot: input.billingSnapshot,
        providerAvailability: input.providerAvailability
      })
    },
    featureGates: {
      enabledCapabilities: resolveShippedPlatformFeatureGates({
        enabledCapabilities: input.featureGates
      })
    },
    approvalContext: input.approvalContext ?? {
      approvalRequired: false,
      approvalIds: []
    },
    auditContext: {
      requestId: input.auditRequestId ?? undefined,
      auditBoundary: input.auditBoundary ?? "customer_truth"
    },
    monitoringContext: {
      health: input.monitoring?.health ?? "healthy"
    }
  };

  return {
    ...base,
    ...input.runtimeContextOverrides,
    organization: { ...base.organization, ...input.runtimeContextOverrides?.organization },
    workspace: { ...base.workspace, ...input.runtimeContextOverrides?.workspace },
    market: { ...base.market, ...input.runtimeContextOverrides?.market },
    identity: { ...base.identity, ...input.runtimeContextOverrides?.identity },
    subscription: { ...base.subscription, ...input.runtimeContextOverrides?.subscription },
    providerPolicies: { ...base.providerPolicies, ...input.runtimeContextOverrides?.providerPolicies },
    featureGates: { ...base.featureGates, ...input.runtimeContextOverrides?.featureGates },
    approvalContext: { ...base.approvalContext, ...input.runtimeContextOverrides?.approvalContext },
    auditContext: { ...base.auditContext, ...input.runtimeContextOverrides?.auditContext },
    monitoringContext: { ...base.monitoringContext, ...input.runtimeContextOverrides?.monitoringContext }
  };
}

export function evaluatePlatformCapabilityGate(input: {
  capabilityId: PlatformCapabilityId;
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  runtimeContext?: PlatformRuntimeContext;
  runtimeContextOverrides?: Partial<PlatformRuntimeContext>;
  runtimeContextInput?: Omit<PlatformRuntimeContextResolverInput, "context" | "billingSnapshot">;
  platformMode?: PlatformCapabilityEvaluationMode;
  billingDecision?: CommercialAccessResult;
  permissionDecision?: PlatformCapabilityGateDecision["sourceDecisions"]["permission"];
  marketDecision?: PlatformCapabilityGateDecision["sourceDecisions"]["market"];
}): PlatformCapabilityGateDecision {
  const runtimeContext =
    input.runtimeContext ??
    resolvePlatformRuntimeContext({
      context: input.context,
      billingSnapshot: input.billingSnapshot,
      ...input.runtimeContextInput,
      runtimeContextOverrides: input.runtimeContextOverrides
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
