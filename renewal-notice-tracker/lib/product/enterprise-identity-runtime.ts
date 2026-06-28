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

export type EnterpriseScimDirectoryStatus =
  | "future"
  | "not_configured"
  | "configured_disabled"
  | "active"
  | "degraded"
  | "suspended";

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
const CUSTOMER_ROLES_ALLOWED_FROM_GROUP_MAPPING = CUSTOMER_ROLES.filter((role) =>
  ["operator", "reviewer"].includes(role)
);
const SENSITIVE_IDENTITY_VALUE_PATTERN =
  /saml|assertion|oidc|id[_\s-]?token|access[_\s-]?token|refresh[_\s-]?token|authorization[_\s-]?code|bearer|scim[_\s-]?payload|provider[_\s-]?(payload|request|response)|client[_\s-]?secret|private[_\s-]?key|certificate|password|secret|token|raw[_\s-]?group|group[_\s-]?payload|sensitive_/i;

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
        ? "enterprise.user_lockout"
        : input.mutation.operation === "recover"
          ? "enterprise.user_recovery"
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
        role: mapping.role,
        reason_code: mapping.reasonCode,
        initiated_by: "scim_directory"
      }
    })
  };
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
