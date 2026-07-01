import { createAuditLog } from "@/lib/audit";
import {
  createCommercialDenialAuditLog,
  getBillingSnapshot,
  getFeatureAccessResult,
  type BillingSnapshot,
  type CommercialFeature,
  type CommercialAccessResult
} from "@/lib/billing/entitlements";
import type { ActiveOrganizationContext, MembershipRole } from "@/lib/auth";
import {
  evaluatePlatformCapabilityGate,
  type PlatformCapabilityGateDecision
} from "@/lib/product/platform-capability-gates";
import type { PlatformCapabilityId, PlatformRuntimeContext } from "@/lib/product/platform-orchestration";

export const INTELLIGENCE_PERMISSIONS = [
  "view_financial_intelligence",
  "view_procurement_analytics",
  "view_risk_scores",
  "manage_intelligence_settings"
] as const;

export type IntelligencePermission = (typeof INTELLIGENCE_PERMISSIONS)[number];

export const INTELLIGENCE_SURFACES = [
  "financial_dashboard",
  "procurement_dashboard",
  "risk_queue",
  "risk_explanation",
  "risk_badge",
  "manage_intelligence_settings"
] as const;

export type IntelligenceSurface = (typeof INTELLIGENCE_SURFACES)[number];

type IntelligencePermissionRule = {
  customerRoles: readonly MembershipRole[];
  futureRoles: readonly string[];
  rationale: string;
};

type IntelligenceSurfaceRule = {
  permission: IntelligencePermission;
  feature: CommercialFeature;
  ownerScoped: boolean;
  allowedRoles?: readonly MembershipRole[];
};

export const INTELLIGENCE_PERMISSION_MATRIX: Record<
  IntelligencePermission,
  IntelligencePermissionRule
> = {
  view_financial_intelligence: {
    customerRoles: ["admin"],
    futureRoles: ["finance_viewer"],
    rationale: "Financial exposure is sensitive commercial data and stays admin-only until a dedicated read-only role exists."
  },
  view_procurement_analytics: {
    customerRoles: ["admin", "operator"],
    futureRoles: [],
    rationale: "Procurement analytics is an operations surface for admins and operators running the renewal portfolio."
  },
  view_risk_scores: {
    customerRoles: ["admin", "operator", "reviewer", "owner"],
    futureRoles: ["legal_validator"],
    rationale: "Risk scores support review and workflow prioritization, with owners limited to their own contracts."
  },
  manage_intelligence_settings: {
    customerRoles: ["admin"],
    futureRoles: [],
    rationale: "Intelligence configuration stays with admins only."
  }
} as const;

export const INTELLIGENCE_SURFACE_MATRIX: Record<IntelligenceSurface, IntelligenceSurfaceRule> = {
  financial_dashboard: {
    permission: "view_financial_intelligence",
    feature: "financial_intelligence",
    ownerScoped: false
  },
  procurement_dashboard: {
    permission: "view_procurement_analytics",
    feature: "procurement_analytics",
    ownerScoped: false
  },
  risk_queue: {
    permission: "view_risk_scores",
    feature: "risk_scores",
    ownerScoped: false,
    allowedRoles: ["admin", "operator", "reviewer"]
  },
  risk_explanation: {
    permission: "view_risk_scores",
    feature: "risk_scores",
    ownerScoped: true,
    allowedRoles: ["admin", "operator", "reviewer", "owner"]
  },
  risk_badge: {
    permission: "view_risk_scores",
    feature: "risk_badges",
    ownerScoped: true,
    allowedRoles: ["admin", "operator", "reviewer", "owner"]
  },
  manage_intelligence_settings: {
    permission: "manage_intelligence_settings",
    feature: "intelligence_settings",
    ownerScoped: false
  }
} as const;

export class IntelligenceAuthorizationError extends Error {
  constructor(
    public readonly surface: IntelligenceSurface,
    public readonly permission: IntelligencePermission,
    public readonly role: string,
    public readonly reason: "forbidden" | "owner_scope_required"
  ) {
    super(`Role "${role}" is not allowed to access intelligence surface "${surface}".`);
    this.name = "IntelligenceAuthorizationError";
  }
}

export class IntelligencePlanAccessError extends Error {
  constructor(
    public readonly surface: IntelligenceSurface,
    public readonly feature: CommercialFeature,
    public readonly access: CommercialAccessResult
  ) {
    super(access.message);
    this.name = "IntelligencePlanAccessError";
  }
}

export class IntelligencePlatformAccessError extends Error {
  constructor(
    public readonly surface: IntelligenceSurface,
    public readonly capabilityId: PlatformCapabilityId,
    public readonly decision: PlatformCapabilityGateDecision
  ) {
    super(decision.customerSafeMessage);
    this.name = "IntelligencePlatformAccessError";
  }
}

export const INTELLIGENCE_SURFACE_PLATFORM_CAPABILITY: Record<IntelligenceSurface, PlatformCapabilityId> = {
  financial_dashboard: "financial_intelligence",
  procurement_dashboard: "procurement_analytics",
  risk_queue: "contract_intelligence",
  risk_explanation: "contract_intelligence",
  risk_badge: "contract_intelligence",
  manage_intelligence_settings: "contract_intelligence"
} as const;

export function canUseIntelligencePermission(
  role: MembershipRole,
  permission: IntelligencePermission
) {
  return INTELLIGENCE_PERMISSION_MATRIX[permission].customerRoles.includes(role);
}

export function getIntelligenceSurfaceAccess(input: {
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  surface: IntelligenceSurface;
  contractOwnerUserId?: string | null;
  platformRuntimeContext?: PlatformRuntimeContext;
  platformRuntimeContextOverrides?: Partial<PlatformRuntimeContext>;
}) {
  const rule = INTELLIGENCE_SURFACE_MATRIX[input.surface];
  const roleAllowed = rule.allowedRoles
    ? rule.allowedRoles.includes(input.context.role)
    : canUseIntelligencePermission(input.context.role, rule.permission);
  const ownerScopedAllowed =
    input.context.role !== "owner" ||
    !rule.ownerScoped ||
    (input.contractOwnerUserId != null && input.contractOwnerUserId === input.context.user.id);
  const featureAccess = getFeatureAccessResult(input.billingSnapshot, rule.feature);
  const platformGate = evaluatePlatformCapabilityGate({
    capabilityId: INTELLIGENCE_SURFACE_PLATFORM_CAPABILITY[input.surface],
    context: input.context,
    billingSnapshot: input.billingSnapshot,
    billingDecision: featureAccess,
    permissionDecision: {
      allowed: roleAllowed && ownerScopedAllowed,
      reasonCode: !roleAllowed ? "role_not_allowed" : !ownerScopedAllowed ? "owner_scope_required" : undefined
    },
    runtimeContext: input.platformRuntimeContext,
    runtimeContextOverrides: input.platformRuntimeContextOverrides
  });

  return {
    allowed: roleAllowed && ownerScopedAllowed && featureAccess.allowed && platformGate.allowed,
    roleAllowed,
    ownerScopedAllowed,
    featureAccess,
    platformGate,
    rule
  };
}

export async function getIntelligenceSurfaceAccessState(input: {
  context: ActiveOrganizationContext;
  surface: IntelligenceSurface;
  contractOwnerUserId?: string | null;
  billingSnapshot?: BillingSnapshot;
  platformRuntimeContext?: PlatformRuntimeContext;
  platformRuntimeContextOverrides?: Partial<PlatformRuntimeContext>;
}) {
  const billingSnapshot =
    input.billingSnapshot ?? (await getBillingSnapshot(input.context.organizationId));
  const access = getIntelligenceSurfaceAccess({
    context: input.context,
    billingSnapshot,
    surface: input.surface,
    contractOwnerUserId: input.contractOwnerUserId,
    platformRuntimeContext: input.platformRuntimeContext,
    platformRuntimeContextOverrides: input.platformRuntimeContextOverrides
  });

  return {
    billingSnapshot,
    access
  };
}

export async function getIntelligenceSurfaceAccessMap(input: {
  context: ActiveOrganizationContext;
  surfaces: readonly IntelligenceSurface[];
  contractOwnerUserId?: string | null;
  platformRuntimeContextOverrides?: Partial<PlatformRuntimeContext>;
}) {
  const billingSnapshot = await getBillingSnapshot(input.context.organizationId);
  const accessBySurface = Object.fromEntries(
    input.surfaces.map((surface) => [
      surface,
      getIntelligenceSurfaceAccess({
        context: input.context,
        billingSnapshot,
        surface,
        contractOwnerUserId: input.contractOwnerUserId,
        platformRuntimeContextOverrides: input.platformRuntimeContextOverrides
      })
    ])
  ) as Record<IntelligenceSurface, ReturnType<typeof getIntelligenceSurfaceAccess>>;

  return {
    billingSnapshot,
    accessBySurface
  };
}

export async function assertCanAccessIntelligenceSurface(input: {
  context: ActiveOrganizationContext;
  surface: IntelligenceSurface;
  contractOwnerUserId?: string | null;
  billingSnapshot?: BillingSnapshot;
  platformRuntimeContext?: PlatformRuntimeContext;
  platformRuntimeContextOverrides?: Partial<PlatformRuntimeContext>;
}) {
  const { billingSnapshot, access } = await getIntelligenceSurfaceAccessState(input);
  if (access.allowed) {
    return {
      billingSnapshot,
      access
    };
  }

  if (!access.roleAllowed || !access.ownerScopedAllowed) {
    const reason = access.roleAllowed ? "owner_scope_required" : "forbidden";
    await createAuditLog({
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      action: "intelligence.access_denied",
      entityType: "intelligence",
      details: {
        surface: input.surface,
        permission: access.rule.permission,
        role: input.context.role,
        reason,
        plan_tier: billingSnapshot.planTier,
        contract_owner_user_id: input.contractOwnerUserId ?? null
      }
    });
    throw new IntelligenceAuthorizationError(
      input.surface,
      access.rule.permission,
      input.context.role,
      reason
    );
  }

  if (!access.platformGate.sourceDecisions.platform.usable) {
    await createAuditLog({
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      action: "intelligence.access_denied",
      entityType: "intelligence",
      details: {
        surface: input.surface,
        permission: access.rule.permission,
        role: input.context.role,
        reason: "platform_capability_blocked",
        platform_capability: access.platformGate.capabilityId,
        platform_status: access.platformGate.internalDiagnostics.platformStatus,
        reason_codes: access.platformGate.reasonCodes,
        plan_tier: billingSnapshot.planTier
      }
    });
    throw new IntelligencePlatformAccessError(
      input.surface,
      access.platformGate.capabilityId,
      access.platformGate
    );
  }

  await createCommercialDenialAuditLog({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    feature: access.rule.feature,
    billingSnapshot,
    accessResult: access.featureAccess,
    context: {
      surface: input.surface,
      intelligence_permission: access.rule.permission
    }
  });

  throw new IntelligencePlanAccessError(input.surface, access.rule.feature, access.featureAccess);
}
