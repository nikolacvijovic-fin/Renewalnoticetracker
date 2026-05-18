import { createAuditLog } from "@/lib/audit";
import {
  createCommercialDenialAuditLog,
  getFeatureAccessResult,
  type BillingSnapshot,
  type CommercialFeature,
  type CommercialAccessResult
} from "@/lib/billing/entitlements";
import type { ActiveOrganizationContext, MembershipRole } from "@/lib/auth";

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

  return {
    allowed: roleAllowed && ownerScopedAllowed && featureAccess.allowed,
    roleAllowed,
    ownerScopedAllowed,
    featureAccess,
    rule
  };
}

export async function assertCanAccessIntelligenceSurface(input: {
  context: ActiveOrganizationContext;
  billingSnapshot: BillingSnapshot;
  surface: IntelligenceSurface;
  contractOwnerUserId?: string | null;
}) {
  const access = getIntelligenceSurfaceAccess(input);
  if (access.allowed) {
    return access;
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
        plan_tier: input.billingSnapshot.planTier,
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

  await createCommercialDenialAuditLog({
    organizationId: input.context.organizationId,
    actorUserId: input.context.user.id,
    feature: access.rule.feature,
    billingSnapshot: input.billingSnapshot,
    accessResult: access.featureAccess,
    context: {
      surface: input.surface,
      intelligence_permission: access.rule.permission
    }
  });

  throw new IntelligencePlanAccessError(input.surface, access.rule.feature, access.featureAccess);
}
