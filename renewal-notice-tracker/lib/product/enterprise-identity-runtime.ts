import { createHash } from "node:crypto";
import {
  ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS,
  ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
  type EnterpriseIdentityAuditEventName,
  type EnterpriseIdentityProvider,
  type EnterpriseProvisioningState,
  type EnterpriseSsoConfigurationState
} from "@/lib/product/enterprise-identity";
import {
  CUSTOMER_ROLES,
  normalizeCustomerRole,
  type CustomerRole
} from "@/lib/product/shipping-profile";

export type EnterpriseIdentityAccessReason =
  | "allowed"
  | "admin_or_owner_required"
  | "enterprise_plan_required"
  | "active_subscription_required"
  | "feature_disabled";

export type EnterpriseIdentityAccessInput = {
  organizationId: string;
  actorUserId: string;
  role: string | null | undefined;
  planTier: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  enterpriseIdentityEnabled?: boolean;
};

export type EnterpriseIdentityAccessResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      actorUserId: string;
      role: "admin" | "owner";
    }
  | {
      allowed: false;
      reason: Exclude<EnterpriseIdentityAccessReason, "allowed">;
      organizationId: string;
      actorUserId: string;
      safeMessage: string;
    };

export type EnterpriseSsoConfigurationModel = {
  organizationId: string;
  provider: EnterpriseIdentityProvider;
  state: EnterpriseSsoConfigurationState;
  issuer?: string | null;
  metadataUrl?: string | null;
  metadataFingerprint?: string | null;
  certificateFingerprint?: string | null;
  certificateExpiresAt?: string | null;
  domainVerificationStatus?: string | null;
};

export type EnterpriseSsoRuntimeStatus =
  | "future"
  | "draft"
  | "configured"
  | "active"
  | "disabled"
  | "error";

export const ENTERPRISE_IDENTITY_PROVIDER_TYPES = ["saml", "oidc"] as const;
export type EnterpriseIdentityProviderType = (typeof ENTERPRISE_IDENTITY_PROVIDER_TYPES)[number];
export const ENTERPRISE_IDENTITY_PROVIDER_STATUSES = [
  "draft",
  "configured",
  "active",
  "disabled",
  "error"
] as const;
export type EnterpriseIdentityProviderStatus =
  (typeof ENTERPRISE_IDENTITY_PROVIDER_STATUSES)[number];
export const ENTERPRISE_SCIM_DIRECTORY_STATUSES = [
  "not_configured",
  "configured",
  "active",
  "disabled",
  "error"
] as const;
export type EnterpriseScimDirectoryStatus =
  (typeof ENTERPRISE_SCIM_DIRECTORY_STATUSES)[number];
export const ENTERPRISE_IDENTITY_MEMBER_STATUSES = [
  "active",
  "locked",
  "deactivated",
  "deprovisioned"
] as const;
export type EnterpriseIdentityMemberStatus =
  (typeof ENTERPRISE_IDENTITY_MEMBER_STATUSES)[number];
export const ENTERPRISE_SCIM_OPERATIONS = ["provision", "update", "deprovision"] as const;
export type EnterpriseScimOperation = (typeof ENTERPRISE_SCIM_OPERATIONS)[number];

export type EnterpriseScimDirectoryConnectionModel = {
  organizationId: string;
  state: EnterpriseScimDirectoryStatus;
  directoryProvider: "scim_2_0";
  bearerTokenFingerprint?: string | null;
  lastRotatedAt?: string | null;
};

export type EnterpriseExternalUserMappingModel = {
  organizationId: string;
  targetUserId: string | null;
  externalIdHash: string;
  emailHash?: string | null;
  provisioningState: EnterpriseProvisioningState;
  role: CustomerRole | null;
  reasonCode: string;
};

export type EnterpriseGroupRoleMappingPolicy = {
  organizationId: string;
  provider: EnterpriseIdentityProvider | "scim_2_0";
  groupIdHash: string;
  requestedRole: string;
  normalizedRole: CustomerRole | null;
  allowed: boolean;
  reasonCode: "allowed" | "unsupported_role" | "owner_mapping_forbidden" | "future_role_forbidden";
};

export type EnterpriseIdentityRoleMappingPolicy = {
  allowAdminGroupMapping?: boolean;
};

export type EnterpriseBreakGlassPolicy = {
  activeAdminOrOwnerCount: number;
  nonScimAdminOrOwnerCount: number;
  breakGlassAdminUserId?: string | null;
};

export type EnterpriseIdentityConfigChangeInput = EnterpriseIdentityAccessInput & {
  configurationOrganizationId: string;
  providerType: EnterpriseIdentityProviderType;
  previousStatus?: EnterpriseIdentityProviderStatus | null;
  nextStatus: EnterpriseIdentityProviderStatus;
  configurationId: string;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type EnterpriseIdentityConfigChangeResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      providerType: EnterpriseIdentityProviderType;
      previousStatus: EnterpriseIdentityProviderStatus | null;
      nextStatus: EnterpriseIdentityProviderStatus;
      audit: ReturnType<typeof buildEnterpriseIdentityAuditInput>;
    }
  | {
      allowed: false;
      reason: Exclude<EnterpriseIdentityAccessReason, "allowed"> | "organization_scope_mismatch";
      organizationId: string;
      safeMessage: string;
    };

export type EnterpriseMemberAccessInput = {
  organizationId: string;
  userId: string;
  membershipRole: string | null | undefined;
  memberStatus?: EnterpriseIdentityMemberStatus | null;
  lockoutReason?: string | null;
};

export type EnterpriseMemberAccessResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      userId: string;
      role: CustomerRole;
    }
  | {
      allowed: false;
      reason:
        | "missing_membership_role"
        | "member_locked"
        | "member_deactivated"
        | "member_deprovisioned"
        | "unknown_member_status";
      organizationId: string;
      userId: string;
      safeMessage: string;
      lockoutReason?: string | null;
    };

export type SafeGroupRoleMappingInput = {
  organizationId: string;
  providerType: EnterpriseIdentityProviderType | "scim";
  groupId: string;
  requestedRole: string;
  policy?: EnterpriseIdentityRoleMappingPolicy;
};

export type SafeGroupRoleMappingResult = {
  organizationId: string;
  providerType: SafeGroupRoleMappingInput["providerType"];
  groupIdHash: string;
  requestedRole: string;
  normalizedRole: CustomerRole | null;
  allowed: boolean;
  reasonCode:
    | "allowed"
    | "unsupported_role"
    | "owner_mapping_forbidden"
    | "admin_mapping_policy_required"
    | "future_role_forbidden";
};

export type BreakGlassAdminPolicyInput = {
  organizationId: string;
  targetUserId: string;
  targetRole: string | null | undefined;
  operation: EnterpriseScimOperation | "lock";
  policy: EnterpriseBreakGlassPolicy;
};

export type BreakGlassAdminPolicyResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      targetUserId: string;
      preservedBy: "not_privileged" | "non_scim_admin_or_owner" | "break_glass_admin";
      audit: ReturnType<typeof buildEnterpriseIdentityAuditInput>;
    }
  | {
      allowed: false;
      reason:
        | "invalid_admin_count"
        | "last_admin_or_owner_required"
        | "non_scim_break_glass_required";
      organizationId: string;
      targetUserId: string;
      safeMessage: string;
      audit: ReturnType<typeof buildEnterpriseIdentityAuditInput>;
    };

export type ScimProvisioningDecisionInput = EnterpriseIdentityFeatureGateInput & {
  directoryOrganizationId: string;
  operation: EnterpriseScimOperation;
  externalId?: string | null;
  email?: string | null;
  targetUserId?: string | null;
  requestedRole?: string | null;
  roleMappingPolicy?: EnterpriseIdentityRoleMappingPolicy;
  currentRole?: string | null;
  breakGlassPolicy?: EnterpriseBreakGlassPolicy;
  rawProviderPayload?: unknown;
};

export type ScimProvisioningDecisionResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      targetUserId: string | null;
      externalIdHash: string;
      emailHash: string | null;
      memberStatus: EnterpriseIdentityMemberStatus;
      role: CustomerRole | null;
      audit: ReturnType<typeof buildEnterpriseIdentityAuditInput>;
    }
  | {
      allowed: false;
      reason:
        | "enterprise_plan_required"
        | "active_subscription_required"
        | "feature_disabled"
        | "organization_scope_mismatch"
        | "last_admin_or_owner_required"
        | "non_scim_break_glass_required"
        | "invalid_admin_count"
        | "unsupported_role"
        | "owner_mapping_forbidden"
        | "admin_mapping_policy_required"
        | "future_role_forbidden";
      organizationId: string;
      safeMessage: string;
      audit?: ReturnType<typeof buildEnterpriseIdentityAuditInput>;
    };

export type EnterpriseProvisionedMemberAccessInput = {
  organizationId: string;
  userId: string;
  membershipRole: string | null | undefined;
  provisioningState?: EnterpriseProvisioningState | null;
  lockoutReason?: string | null;
  breakGlassRecoveryActive?: boolean;
};

export type EnterpriseProvisionedMemberAccessResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      userId: string;
      role: CustomerRole;
      breakGlassRecoveryActive: boolean;
    }
  | {
      allowed: false;
      reason:
        | "missing_membership_role"
        | "provisioning_pending"
        | "user_deprovisioned"
        | "user_locked"
        | "unknown_provisioning_state";
      organizationId: string;
      userId: string;
      safeMessage: string;
      lockoutReason?: string | null;
    };

export type EnterpriseScimMutationInput = {
  organizationId: string;
  operation: "create" | "update" | "delete" | "lock" | "recover";
  externalId?: string | null;
  email?: string | null;
  targetUserId?: string | null;
  requestedRole?: string | null;
  active?: boolean;
  reasonCode?: string | null;
};

export type EnterpriseIdentityFeatureGateInput = {
  organizationId: string;
  planTier: string | null | undefined;
  subscriptionStatus: string | null | undefined;
  enterpriseIdentityEnabled?: boolean;
};

export type EnterpriseIdentityFeatureGateResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
    }
  | {
      allowed: false;
      reason:
        | "enterprise_plan_required"
        | "active_subscription_required"
        | "feature_disabled";
      organizationId: string;
      safeMessage: string;
    };

export type EnterpriseSsoConfigurationReadinessDeniedReason =
  | "enterprise_plan_required"
  | "active_subscription_required"
  | "feature_disabled"
  | "organization_scope_mismatch"
  | "unsupported_provider"
  | "unsupported_status";

export type EnterpriseSsoConfigurationReadinessInput = EnterpriseIdentityFeatureGateInput & {
  configurationOrganizationId: string;
  provider: EnterpriseIdentityProvider;
  status: EnterpriseSsoRuntimeStatus;
  metadataFingerprint?: string | null;
  certificateFingerprint?: string | null;
  certificateExpiresAt?: string | null;
  domainVerified?: boolean;
};

export type EnterpriseSsoConfigurationReadinessResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      provider: EnterpriseIdentityProvider;
      status: EnterpriseSsoRuntimeStatus;
      readyForFutureLogin: boolean;
      canAffectCurrentLogin: false;
      missingRequirements: readonly string[];
    }
  | {
      allowed: false;
      reason: EnterpriseSsoConfigurationReadinessDeniedReason;
      organizationId: string;
      safeMessage: string;
    };

export type EnterpriseBreakGlassPreservationInput = {
  organizationId: string;
  targetUserId: string;
  targetRole: string | null | undefined;
  operation: EnterpriseScimMutationInput["operation"];
  activeAdminOrOwnerCount: number;
  breakGlassRecoveryActive?: boolean;
};

export type EnterpriseBreakGlassPreservationResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      targetUserId: string;
      breakGlassRecoveryActive: boolean;
    }
  | {
      allowed: false;
      reason:
        | "last_admin_or_owner_required"
        | "break_glass_recovery_required"
        | "invalid_admin_count";
      organizationId: string;
      targetUserId: string;
      safeMessage: string;
    };

export type EnterpriseScimMutationDecisionInput = EnterpriseIdentityFeatureGateInput & {
  directoryOrganizationId: string;
  mutation: EnterpriseScimMutationInput;
  targetCurrentRole?: string | null;
  activeAdminOrOwnerCount?: number | null;
  breakGlassRecoveryActive?: boolean;
};

export type EnterpriseScimMutationDecisionDeniedReason =
  | "enterprise_plan_required"
  | "active_subscription_required"
  | "feature_disabled"
  | "organization_scope_mismatch"
  | "last_admin_or_owner_required"
  | "break_glass_recovery_required"
  | "invalid_admin_count";

export type EnterpriseScimMutationDecisionResult =
  | {
      allowed: true;
      reason: "allowed";
      organizationId: string;
      mapping: EnterpriseExternalUserMappingModel;
      audit: ReturnType<typeof buildEnterpriseIdentityAuditLogInput>;
    }
  | {
      allowed: false;
      reason: EnterpriseScimMutationDecisionDeniedReason;
      organizationId: string;
      safeMessage: string;
    };

export type EnterpriseIdentityAuditInput = {
  organizationId: string;
  actorUserId?: string | null;
  eventName: EnterpriseIdentityAuditEventName;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type EnterpriseSsoConfigurationAuditInput = {
  organizationId: string;
  actorUserId: string;
  configurationId: string;
  provider: EnterpriseIdentityProvider;
  previousStatus?: EnterpriseSsoRuntimeStatus | null;
  newStatus: EnterpriseSsoRuntimeStatus;
  reasonCode?: string | null;
  metadataFingerprint?: string | null;
  certificateFingerprint?: string | null;
  certificateExpiresAt?: string | null;
};

export type EnterpriseGroupRoleMappingAuditInput = {
  organizationId: string;
  actorUserId: string;
  mappingId: string;
  mapping: EnterpriseGroupRoleMappingPolicy;
  reasonCode?: string | null;
};

export type EnterpriseBreakGlassAuditInput = {
  organizationId: string;
  actorUserId?: string | null;
  targetUserId: string;
  preserved: boolean;
  activeAdminOrOwnerCount: number;
  blockedReason?: string | null;
  reasonCode?: string | null;
};

const ACTIVE_ENTERPRISE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const ENTERPRISE_IDENTITY_SUPPORTED_PROVIDER_SET = new Set<EnterpriseIdentityProvider>([
  "saml_2_0",
  "oidc"
]);
const ENTERPRISE_SSO_RUNTIME_STATUS_SET = new Set<EnterpriseSsoRuntimeStatus>([
  "future",
  "draft",
  "configured",
  "active",
  "disabled",
  "error"
]);
const ENTERPRISE_IDENTITY_PROVIDER_STATUS_SET = new Set<EnterpriseIdentityProviderStatus>(
  ENTERPRISE_IDENTITY_PROVIDER_STATUSES
);
const ENTERPRISE_IDENTITY_MEMBER_STATUS_SET = new Set<EnterpriseIdentityMemberStatus>(
  ENTERPRISE_IDENTITY_MEMBER_STATUSES
);
const CUSTOMER_ROLES_ALLOWED_FROM_GROUP_MAPPING = CUSTOMER_ROLES.filter((role) =>
  ["operator", "reviewer"].includes(role)
);
const SENSITIVE_IDENTITY_VALUE_PATTERN =
  /saml|assertion|oidc|id[_\s-]?token|access[_\s-]?token|refresh[_\s-]?token|authorization[_\s-]?code|bearer|scim[_\s-]?payload|provider[_\s-]?(payload|request|response)|client[_\s-]?secret|private[_\s-]?key|certificate|password|secret|token|raw[_\s-]?group|group[_\s-]?payload|raw[_\s-]?profile|profile[_\s-]?payload|sensitive_/i;

function stableHash(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function evaluateEnterpriseIdentityAdminAccess(
  input: EnterpriseIdentityAccessInput
): EnterpriseIdentityAccessResult {
  const role = normalizeCustomerRole(input.role);

  if (role !== "admin" && role !== "owner") {
    return {
      allowed: false,
      reason: "admin_or_owner_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Enterprise identity settings require an organization admin or owner."
    };
  }

  if (input.planTier !== "enterprise") {
    return {
      allowed: false,
      reason: "enterprise_plan_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Enterprise identity settings require the Enterprise plan."
    };
  }

  if (!input.subscriptionStatus || !ACTIVE_ENTERPRISE_SUBSCRIPTION_STATUSES.has(input.subscriptionStatus)) {
    return {
      allowed: false,
      reason: "active_subscription_required",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Enterprise identity settings require an active Enterprise subscription."
    };
  }

  if (!input.enterpriseIdentityEnabled) {
    return {
      allowed: false,
      reason: "feature_disabled",
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      safeMessage: "Enterprise identity runtime is not enabled for this workspace."
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    role
  };
}

export function evaluateEnterpriseIdentityAccess(input: EnterpriseIdentityAccessInput) {
  return evaluateEnterpriseIdentityAdminAccess(input);
}

export function evaluateEnterpriseIdentityFeatureGate(
  input: EnterpriseIdentityFeatureGateInput
): EnterpriseIdentityFeatureGateResult {
  if (input.planTier !== "enterprise") {
    return {
      allowed: false,
      reason: "enterprise_plan_required",
      organizationId: input.organizationId,
      safeMessage: "Enterprise identity operations require the Enterprise plan."
    };
  }

  if (!input.subscriptionStatus || !ACTIVE_ENTERPRISE_SUBSCRIPTION_STATUSES.has(input.subscriptionStatus)) {
    return {
      allowed: false,
      reason: "active_subscription_required",
      organizationId: input.organizationId,
      safeMessage: "Enterprise identity operations require an active Enterprise subscription."
    };
  }

  if (!input.enterpriseIdentityEnabled) {
    return {
      allowed: false,
      reason: "feature_disabled",
      organizationId: input.organizationId,
      safeMessage: "Enterprise identity runtime is not enabled for this workspace."
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId
  };
}

export function prepareEnterpriseIdentityConfigChange(
  input: EnterpriseIdentityConfigChangeInput
): EnterpriseIdentityConfigChangeResult {
  const access = evaluateEnterpriseIdentityAccess(input);
  if (!access.allowed) {
    return {
      allowed: false,
      reason: access.reason,
      organizationId: input.organizationId,
      safeMessage: access.safeMessage
    };
  }

  if (input.configurationOrganizationId !== input.organizationId) {
    return {
      allowed: false,
      reason: "organization_scope_mismatch",
      organizationId: input.organizationId,
      safeMessage: "Enterprise identity configuration must be scoped to the active organization."
    };
  }

  const nextStatus = ENTERPRISE_IDENTITY_PROVIDER_STATUS_SET.has(input.nextStatus)
    ? input.nextStatus
    : "error";
  const previousStatus =
    input.previousStatus && ENTERPRISE_IDENTITY_PROVIDER_STATUS_SET.has(input.previousStatus)
      ? input.previousStatus
      : null;

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    providerType: input.providerType,
    previousStatus,
    nextStatus,
    audit: buildEnterpriseIdentityAuditInput({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      eventName: "identity.sso_config_changed",
      entityId: input.configurationId,
      metadata: {
        ...input.metadata,
        sso_configuration_id: input.configurationId,
        provider: input.providerType,
        previous_state: previousStatus ?? undefined,
        new_state: nextStatus,
        reason_code: input.reasonCode ?? undefined
      }
    })
  };
}

export function evaluateEnterpriseMemberAccess(
  input: EnterpriseMemberAccessInput
): EnterpriseMemberAccessResult {
  const role = normalizeCustomerRole(input.membershipRole);
  if (!role) {
    return {
      allowed: false,
      reason: "missing_membership_role",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "A current organization membership is required."
    };
  }

  if (!input.memberStatus || input.memberStatus === "active") {
    return {
      allowed: true,
      reason: "allowed",
      organizationId: input.organizationId,
      userId: input.userId,
      role
    };
  }

  if (!ENTERPRISE_IDENTITY_MEMBER_STATUS_SET.has(input.memberStatus)) {
    return {
      allowed: false,
      reason: "unknown_member_status",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity member status is not recognized."
    };
  }

  if (input.memberStatus === "locked") {
    return {
      allowed: false,
      reason: "member_locked",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity member is locked.",
      lockoutReason: input.lockoutReason ?? null
    };
  }

  if (input.memberStatus === "deactivated") {
    return {
      allowed: false,
      reason: "member_deactivated",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity member is deactivated."
    };
  }

  return {
    allowed: false,
    reason: "member_deprovisioned",
    organizationId: input.organizationId,
    userId: input.userId,
    safeMessage: "Enterprise identity member has been deprovisioned."
  };
}

export function evaluateEnterpriseSsoConfigurationReadiness(
  input: EnterpriseSsoConfigurationReadinessInput
): EnterpriseSsoConfigurationReadinessResult {
  const featureGate = evaluateEnterpriseIdentityFeatureGate(input);
  if (!featureGate.allowed) return featureGate;

  if (input.configurationOrganizationId !== input.organizationId) {
    return {
      allowed: false,
      reason: "organization_scope_mismatch",
      organizationId: input.organizationId,
      safeMessage: "SSO configuration must be scoped to the active organization."
    };
  }

  if (!ENTERPRISE_IDENTITY_SUPPORTED_PROVIDER_SET.has(input.provider)) {
    return {
      allowed: false,
      reason: "unsupported_provider",
      organizationId: input.organizationId,
      safeMessage: "SSO provider is not supported."
    };
  }

  if (!ENTERPRISE_SSO_RUNTIME_STATUS_SET.has(input.status)) {
    return {
      allowed: false,
      reason: "unsupported_status",
      organizationId: input.organizationId,
      safeMessage: "SSO configuration status is not supported."
    };
  }

  const missingRequirements = [
    input.metadataFingerprint ? null : "metadata_fingerprint_required",
    input.certificateFingerprint ? null : "certificate_fingerprint_required",
    input.domainVerified ? null : "domain_verification_required",
    isCertificateExpired(input.certificateExpiresAt) ? "certificate_not_expired_required" : null
  ].filter(Boolean) as string[];

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    provider: input.provider,
    status: input.status,
    readyForFutureLogin: input.status === "active" && missingRequirements.length === 0,
    canAffectCurrentLogin: false,
    missingRequirements
  };
}

export function canEnterpriseProvisionedUserAuthenticate(state: EnterpriseProvisioningState) {
  return state === "active";
}

export function evaluateEnterpriseProvisionedMemberAccess(
  input: EnterpriseProvisionedMemberAccessInput
): EnterpriseProvisionedMemberAccessResult {
  const role = normalizeCustomerRole(input.membershipRole);

  if (!role) {
    return {
      allowed: false,
      reason: "missing_membership_role",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "A current organization membership is required."
    };
  }

  if (!input.provisioningState) {
    return {
      allowed: true,
      reason: "allowed",
      organizationId: input.organizationId,
      userId: input.userId,
      role,
      breakGlassRecoveryActive: Boolean(input.breakGlassRecoveryActive)
    };
  }

  if (input.provisioningState === "active") {
    return {
      allowed: true,
      reason: "allowed",
      organizationId: input.organizationId,
      userId: input.userId,
      role,
      breakGlassRecoveryActive: Boolean(input.breakGlassRecoveryActive)
    };
  }

  if (input.provisioningState === "pending") {
    return {
      allowed: false,
      reason: "provisioning_pending",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity provisioning is still pending."
    };
  }

  if (input.provisioningState === "locked") {
    return {
      allowed: false,
      reason: "user_locked",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity access is locked.",
      lockoutReason: input.lockoutReason ?? null
    };
  }

  if (
    input.provisioningState === "soft_deprovisioned" ||
    input.provisioningState === "hard_deprovisioned"
  ) {
    return {
      allowed: false,
      reason: "user_deprovisioned",
      organizationId: input.organizationId,
      userId: input.userId,
      safeMessage: "Enterprise identity access has been deprovisioned."
    };
  }

  return {
    allowed: false,
    reason: "unknown_provisioning_state",
    organizationId: input.organizationId,
    userId: input.userId,
    safeMessage: "Enterprise identity state is not recognized."
  };
}

export function normalizeEnterpriseGroupRoleMapping(input: {
  organizationId: string;
  provider: EnterpriseGroupRoleMappingPolicy["provider"];
  groupId: string;
  requestedRole: string;
}): EnterpriseGroupRoleMappingPolicy {
  const normalizedRole = normalizeCustomerRole(input.requestedRole);
  const groupIdHash = stableHash(input.groupId);

  if (!normalizedRole) {
    return {
      organizationId: input.organizationId,
      provider: input.provider,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole: null,
      allowed: false,
      reasonCode: input.requestedRole.includes("_") ? "future_role_forbidden" : "unsupported_role"
    };
  }

  if (normalizedRole === "owner") {
    return {
      organizationId: input.organizationId,
      provider: input.provider,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole,
      allowed: false,
      reasonCode: "owner_mapping_forbidden"
    };
  }

  if (normalizedRole === "admin") {
    return {
      organizationId: input.organizationId,
      provider: input.provider,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole,
      allowed: false,
      reasonCode: "future_role_forbidden"
    };
  }

  return {
    organizationId: input.organizationId,
    provider: input.provider,
    groupIdHash,
    requestedRole: input.requestedRole,
    normalizedRole,
    allowed: CUSTOMER_ROLES_ALLOWED_FROM_GROUP_MAPPING.includes(normalizedRole),
    reasonCode: "allowed"
  };
}

export function resolveSafeGroupRoleMapping(
  input: SafeGroupRoleMappingInput
): SafeGroupRoleMappingResult {
  const normalizedRole = normalizeCustomerRole(input.requestedRole);
  const groupIdHash = stableHash(input.groupId);

  if (!normalizedRole) {
    return {
      organizationId: input.organizationId,
      providerType: input.providerType,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole: null,
      allowed: false,
      reasonCode: input.requestedRole.includes("_") ? "future_role_forbidden" : "unsupported_role"
    };
  }

  if (normalizedRole === "owner") {
    return {
      organizationId: input.organizationId,
      providerType: input.providerType,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole,
      allowed: false,
      reasonCode: "owner_mapping_forbidden"
    };
  }

  if (normalizedRole === "admin" && !input.policy?.allowAdminGroupMapping) {
    return {
      organizationId: input.organizationId,
      providerType: input.providerType,
      groupIdHash,
      requestedRole: input.requestedRole,
      normalizedRole,
      allowed: false,
      reasonCode: "admin_mapping_policy_required"
    };
  }

  return {
    organizationId: input.organizationId,
    providerType: input.providerType,
    groupIdHash,
    requestedRole: input.requestedRole,
    normalizedRole,
    allowed: true,
    reasonCode: "allowed"
  };
}

export function normalizeEnterpriseScimMutation(
  input: EnterpriseScimMutationInput
): EnterpriseExternalUserMappingModel {
  const requestedMapping = input.requestedRole
    ? normalizeEnterpriseGroupRoleMapping({
        organizationId: input.organizationId,
        provider: "scim_2_0",
        groupId: `direct-role:${input.requestedRole}`,
        requestedRole: input.requestedRole
      })
    : null;

  const provisioningState: EnterpriseProvisioningState =
    input.operation === "delete"
      ? "soft_deprovisioned"
      : input.operation === "lock"
        ? "locked"
        : input.operation === "recover"
          ? "active"
          : input.active === false
            ? "soft_deprovisioned"
            : "active";

  return {
    organizationId: input.organizationId,
    targetUserId: input.targetUserId ?? null,
    externalIdHash: stableHash(input.externalId ?? input.email ?? input.targetUserId ?? "unknown"),
    emailHash: input.email ? stableHash(input.email) : null,
    provisioningState,
    role: requestedMapping?.allowed ? requestedMapping.normalizedRole : null,
    reasonCode:
      input.reasonCode ??
      (requestedMapping && !requestedMapping.allowed ? requestedMapping.reasonCode : "scim_normalized")
  };
}

export function evaluateEnterpriseBreakGlassPreservation(
  input: EnterpriseBreakGlassPreservationInput
): EnterpriseBreakGlassPreservationResult {
  const role = normalizeCustomerRole(input.targetRole);
  const removesPrivilegedAccess =
    (input.operation === "delete" || input.operation === "lock") &&
    (role === "admin" || role === "owner");

  if (!Number.isInteger(input.activeAdminOrOwnerCount) || input.activeAdminOrOwnerCount < 0) {
    return {
      allowed: false,
      reason: "invalid_admin_count",
      organizationId: input.organizationId,
      targetUserId: input.targetUserId,
      safeMessage: "Enterprise identity recovery safety requires a valid admin/owner count."
    };
  }

  if (!removesPrivilegedAccess) {
    return {
      allowed: true,
      reason: "allowed",
      organizationId: input.organizationId,
      targetUserId: input.targetUserId,
      breakGlassRecoveryActive: Boolean(input.breakGlassRecoveryActive)
    };
  }

  if (input.activeAdminOrOwnerCount <= 1) {
    return {
      allowed: false,
      reason: "last_admin_or_owner_required",
      organizationId: input.organizationId,
      targetUserId: input.targetUserId,
      safeMessage: "Enterprise identity changes must preserve at least one admin or owner."
    };
  }

  if (!input.breakGlassRecoveryActive) {
    return {
      allowed: false,
      reason: "break_glass_recovery_required",
      organizationId: input.organizationId,
      targetUserId: input.targetUserId,
      safeMessage: "Privileged deprovisioning requires a documented break-glass recovery path."
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    targetUserId: input.targetUserId,
    breakGlassRecoveryActive: true
  };
}

export function evaluateBreakGlassAdminPolicy(
  input: BreakGlassAdminPolicyInput
): BreakGlassAdminPolicyResult {
  const role = normalizeCustomerRole(input.targetRole);
  const removesPrivilegedAccess =
    (input.operation === "deprovision" || input.operation === "lock") &&
    (role === "admin" || role === "owner");

  if (
    !Number.isInteger(input.policy.activeAdminOrOwnerCount) ||
    !Number.isInteger(input.policy.nonScimAdminOrOwnerCount) ||
    input.policy.activeAdminOrOwnerCount < 0 ||
    input.policy.nonScimAdminOrOwnerCount < 0
  ) {
    return buildBreakGlassPolicyResult(input, false, "invalid_admin_count");
  }

  if (!removesPrivilegedAccess) {
    return buildBreakGlassPolicyResult(input, true, "allowed", "not_privileged");
  }

  if (input.policy.activeAdminOrOwnerCount <= 1) {
    return buildBreakGlassPolicyResult(input, false, "last_admin_or_owner_required");
  }

  if (input.policy.nonScimAdminOrOwnerCount < 1 && !input.policy.breakGlassAdminUserId) {
    return buildBreakGlassPolicyResult(input, false, "non_scim_break_glass_required");
  }

  return buildBreakGlassPolicyResult(
    input,
    true,
    "allowed",
    input.policy.nonScimAdminOrOwnerCount >= 1 ? "non_scim_admin_or_owner" : "break_glass_admin"
  );
}

function buildBreakGlassPolicyResult(
  input: BreakGlassAdminPolicyInput,
  allowed: true,
  reason: "allowed",
  preservedBy: BreakGlassAdminPolicyResult extends infer Result
    ? Result extends { allowed: true; preservedBy: infer PreservedBy }
      ? PreservedBy
      : never
    : never
): BreakGlassAdminPolicyResult;
function buildBreakGlassPolicyResult(
  input: BreakGlassAdminPolicyInput,
  allowed: false,
  reason: Exclude<BreakGlassAdminPolicyResult["reason"], "allowed">
): BreakGlassAdminPolicyResult;
function buildBreakGlassPolicyResult(
  input: BreakGlassAdminPolicyInput,
  allowed: boolean,
  reason: BreakGlassAdminPolicyResult["reason"],
  preservedBy?: "not_privileged" | "non_scim_admin_or_owner" | "break_glass_admin"
): BreakGlassAdminPolicyResult {
  const audit = buildEnterpriseIdentityAuditInput({
    organizationId: input.organizationId,
    actorUserId: null,
    eventName: "identity.break_glass_policy_checked",
    entityId: input.targetUserId,
    metadata: {
      target_user_id: input.targetUserId,
      role: normalizeCustomerRole(input.targetRole) ?? undefined,
      outcome: allowed ? "preserved" : "blocked",
      active_admin_owner_count: input.policy.activeAdminOrOwnerCount,
      blocked_reason: allowed ? undefined : reason,
      reason_code: reason,
      recovery_method: preservedBy
    }
  });

  if (allowed) {
    return {
      allowed: true,
      reason: "allowed",
      organizationId: input.organizationId,
      targetUserId: input.targetUserId,
      preservedBy: preservedBy ?? "break_glass_admin",
      audit
    };
  }

  return {
    allowed: false,
    reason: reason as Exclude<BreakGlassAdminPolicyResult["reason"], "allowed">,
    organizationId: input.organizationId,
    targetUserId: input.targetUserId,
    safeMessage:
      reason === "invalid_admin_count"
        ? "Enterprise identity recovery safety requires valid admin/owner counts."
        : reason === "last_admin_or_owner_required"
          ? "Enterprise identity changes must preserve at least one admin or owner."
          : "Privileged SCIM changes require a non-SCIM or break-glass admin path.",
    audit
  };
}

export function prepareScimProvisioningDecision(
  input: ScimProvisioningDecisionInput
): ScimProvisioningDecisionResult {
  const featureGate = evaluateEnterpriseIdentityFeatureGate(input);
  if (!featureGate.allowed) return featureGate;

  if (input.directoryOrganizationId !== input.organizationId) {
    return {
      allowed: false,
      reason: "organization_scope_mismatch",
      organizationId: input.organizationId,
      safeMessage: "SCIM provisioning must be scoped to the active organization."
    };
  }

  const mapping = input.requestedRole
    ? resolveSafeGroupRoleMapping({
        organizationId: input.organizationId,
        providerType: "scim",
        groupId: `direct-role:${input.requestedRole}`,
        requestedRole: input.requestedRole,
        policy: input.roleMappingPolicy
      })
    : null;

  if (mapping && !mapping.allowed) {
    const deniedReason = mapping.reasonCode as Exclude<
      SafeGroupRoleMappingResult["reasonCode"],
      "allowed"
    >;
    return {
      allowed: false,
      reason: deniedReason,
      organizationId: input.organizationId,
      safeMessage: "SCIM role mapping is not allowed by the enterprise identity policy."
    };
  }

  if (input.operation === "deprovision" && input.breakGlassPolicy) {
    const breakGlass = evaluateBreakGlassAdminPolicy({
      organizationId: input.organizationId,
      targetUserId: input.targetUserId ?? "unknown",
      targetRole: input.currentRole ?? mapping?.normalizedRole ?? null,
      operation: "deprovision",
      policy: input.breakGlassPolicy
    });
    if (!breakGlass.allowed) {
      return {
        allowed: false,
        reason: breakGlass.reason,
        organizationId: input.organizationId,
        safeMessage: breakGlass.safeMessage,
        audit: breakGlass.audit
      };
    }
  }

  const memberStatus: EnterpriseIdentityMemberStatus =
    input.operation === "deprovision" ? "deprovisioned" : "active";
  const eventName =
    input.operation === "provision"
      ? "identity.scim_user_provisioned"
      : input.operation === "update"
        ? "identity.scim_user_updated"
        : "identity.scim_user_deprovisioned";

  const externalIdHash = stableHash(input.externalId ?? input.email ?? input.targetUserId ?? "unknown");
  const emailHash = input.email ? stableHash(input.email) : null;

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    targetUserId: input.targetUserId ?? null,
    externalIdHash,
    emailHash,
    memberStatus,
    role: mapping?.normalizedRole ?? null,
    audit: buildEnterpriseIdentityAuditInput({
      organizationId: input.organizationId,
      actorUserId: null,
      eventName,
      entityId: input.targetUserId ?? null,
      metadata: {
        provider: "scim",
        target_user_id: input.targetUserId ?? undefined,
        previous_state: input.currentRole ?? undefined,
        new_state: memberStatus,
        role: mapping?.normalizedRole ?? undefined,
        reason_code: mapping?.reasonCode ?? "scim_decision_normalized",
        initiated_by: "scim_directory",
        scim_user_id: externalIdHash
      }
    })
  };
}

export function prepareEnterpriseScimMutationDecision(
  input: EnterpriseScimMutationDecisionInput
): EnterpriseScimMutationDecisionResult {
  const featureGate = evaluateEnterpriseIdentityFeatureGate(input);
  if (!featureGate.allowed) return featureGate;

  if (input.directoryOrganizationId !== input.organizationId) {
    return {
      allowed: false,
      reason: "organization_scope_mismatch",
      organizationId: input.organizationId,
      safeMessage: "SCIM mutation must be scoped to the directory organization."
    };
  }

  const breakGlass = evaluateEnterpriseBreakGlassPreservation({
    organizationId: input.organizationId,
    targetUserId: input.mutation.targetUserId ?? "unknown",
    targetRole: input.targetCurrentRole,
    operation: input.mutation.operation,
    activeAdminOrOwnerCount: input.activeAdminOrOwnerCount ?? 1,
    breakGlassRecoveryActive: input.breakGlassRecoveryActive
  });
  if (!breakGlass.allowed) {
    return {
      allowed: false,
      reason: breakGlass.reason,
      organizationId: input.organizationId,
      safeMessage: breakGlass.safeMessage
    };
  }

  const mapping = normalizeEnterpriseScimMutation({
    ...input.mutation,
    organizationId: input.organizationId
  });
  const eventName =
    mapping.provisioningState === "soft_deprovisioned" ||
    mapping.provisioningState === "hard_deprovisioned"
      ? "enterprise.scim_user_deprovisioned"
      : mapping.provisioningState === "locked"
        ? "enterprise.identity_member_locked"
        : input.mutation.operation === "recover"
          ? "enterprise.identity_member_unlocked"
          : input.mutation.operation === "update"
            ? "enterprise.scim_user_updated"
            : "enterprise.scim_user_provisioned";

  return {
    allowed: true,
    reason: "allowed",
    organizationId: input.organizationId,
    mapping,
    audit: buildEnterpriseIdentityAuditLogInput({
      organizationId: input.organizationId,
      actorUserId: null,
      eventName,
      entityId: mapping.targetUserId,
      metadata: {
        provider: "scim_2_0",
        target_user_id: mapping.targetUserId,
        previous_state: input.mutation.operation,
        new_state: mapping.provisioningState,
        role: mapping.role,
        reason_code: mapping.reasonCode,
        initiated_by: "scim_directory"
      }
    })
  };
}

export function buildEnterpriseSsoConfigurationAuditLogInput(
  input: EnterpriseSsoConfigurationAuditInput
) {
  const eventName: EnterpriseIdentityAuditEventName =
    input.previousStatus === undefined || input.previousStatus === null
      ? "enterprise.identity_provider_configured"
      : "enterprise.sso_config_changed";

  return buildEnterpriseIdentityAuditLogInput({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventName,
    entityId: input.configurationId,
    metadata: {
      sso_configuration_id: input.configurationId,
      provider: input.provider,
      previous_state: input.previousStatus ?? undefined,
      new_state: input.newStatus,
      reason_code: input.reasonCode ?? undefined,
      metadata_fingerprint: input.metadataFingerprint ?? undefined,
      certificate_fingerprint: input.certificateFingerprint ?? undefined,
      certificate_expires_at: input.certificateExpiresAt ?? undefined
    }
  });
}

export function buildEnterpriseGroupRoleMappingAuditLogInput(
  input: EnterpriseGroupRoleMappingAuditInput
) {
  return buildEnterpriseIdentityAuditLogInput({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventName: "enterprise.role_group_mapping_changed",
    entityId: input.mappingId,
    metadata: {
      mapping_id: input.mappingId,
      provider: input.mapping.provider,
      group_id_hash: input.mapping.groupIdHash,
      role: input.mapping.normalizedRole,
      reason_code: input.reasonCode ?? input.mapping.reasonCode
    }
  });
}

export function buildEnterpriseBreakGlassAuditLogInput(input: EnterpriseBreakGlassAuditInput) {
  return buildEnterpriseIdentityAuditLogInput({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    eventName: input.preserved
      ? "enterprise.break_glass_admin_preserved"
      : "enterprise.break_glass_admin_blocked",
    entityId: input.targetUserId,
    metadata: {
      target_user_id: input.targetUserId,
      outcome: input.preserved ? "preserved" : "blocked",
      active_admin_owner_count: input.activeAdminOrOwnerCount,
      blocked_reason: input.blockedReason ?? undefined,
      reason_code: input.reasonCode ?? undefined
    }
  });
}

export function sanitizeEnterpriseIdentityAuditMetadata(
  eventName: EnterpriseIdentityAuditEventName,
  metadata: Record<string, unknown> = {}
) {
  const contract = ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS[eventName];
  const forbiddenKeys = new Set<string>(ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS);
  const allowedKeys = new Set<string>(contract.allowedSafeMetadataKeys);
  return sanitizeIdentityRecord(metadata, allowedKeys, forbiddenKeys);
}

export function buildEnterpriseIdentityAuditLogInput(input: EnterpriseIdentityAuditInput) {
  return {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: input.eventName,
    entityType: "enterprise_identity",
    entityId: input.entityId ?? null,
    details: sanitizeEnterpriseIdentityAuditMetadata(input.eventName, input.metadata)
  };
}

export function buildEnterpriseIdentityAuditInput(input: EnterpriseIdentityAuditInput) {
  return buildEnterpriseIdentityAuditLogInput(input);
}

export function sanitizeEnterpriseIdentityMetadata(
  metadata: Record<string, unknown> = {},
  eventName: EnterpriseIdentityAuditEventName = "identity.sso_config_changed"
) {
  return sanitizeEnterpriseIdentityAuditMetadata(eventName, metadata);
}

function sanitizeIdentityRecord(
  metadata: Record<string, unknown>,
  allowedKeys: Set<string>,
  forbiddenKeys: Set<string>
) {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!allowedKeys.has(key)) continue;
    if (forbiddenKeys.has(key)) continue;
    const safeValue = sanitizeIdentityValue(value, allowedKeys, forbiddenKeys);
    if (safeValue === undefined) continue;
    sanitized[key] = safeValue;
  }
  return sanitized;
}

function sanitizeIdentityValue(
  value: unknown,
  allowedKeys: Set<string>,
  forbiddenKeys: Set<string>
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return SENSITIVE_IDENTITY_VALUE_PATTERN.test(value) ? undefined : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeIdentityValue(item, allowedKeys, forbiddenKeys))
      .filter((item) => item !== undefined);
  }
  if (typeof value === "object") {
    return sanitizeIdentityRecord(value as Record<string, unknown>, allowedKeys, forbiddenKeys);
  }
  return undefined;
}

function isCertificateExpired(certificateExpiresAt: string | null | undefined) {
  if (!certificateExpiresAt) return false;
  const expiresAt = new Date(certificateExpiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}
