import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import {
  ENTERPRISE_SENSITIVE_ACTION_RULES,
  type EnterpriseSensitiveActionId
} from "@/lib/product/enterprise-rbac";

export const ENTERPRISE_IDENTITY_SUPPORTED_PROVIDERS = ["saml_2_0", "oidc"] as const;
export type EnterpriseIdentityProvider = (typeof ENTERPRISE_IDENTITY_SUPPORTED_PROVIDERS)[number];

export const ENTERPRISE_SSO_CONFIGURATION_STATES = [
  "not_configured",
  "configured_disabled",
  "metadata_pending",
  "domain_verification_pending",
  "enabled",
  "degraded",
  "suspended"
] as const;

export type EnterpriseSsoConfigurationState =
  (typeof ENTERPRISE_SSO_CONFIGURATION_STATES)[number];

export const ENTERPRISE_PROVISIONING_STATES = [
  "pending",
  "active",
  "soft_deprovisioned",
  "hard_deprovisioned",
  "locked"
] as const;

export type EnterpriseProvisioningState = (typeof ENTERPRISE_PROVISIONING_STATES)[number];

export type EnterpriseIdentityLifecycleCategory =
  | "sso_configuration"
  | "scim_provisioning";

export type EnterpriseIdentityStateDefinition = {
  id: EnterpriseSsoConfigurationState | EnterpriseProvisioningState;
  category: EnterpriseIdentityLifecycleCategory;
  allowedInCurrentRuntime: boolean;
  futureOnly: boolean;
  userCanAuthenticateInFuture: boolean;
  description: string;
};

export const ENTERPRISE_IDENTITY_STATE_REGISTRY: Record<
  EnterpriseSsoConfigurationState | EnterpriseProvisioningState,
  EnterpriseIdentityStateDefinition
> = {
  not_configured: {
    id: "not_configured",
    category: "sso_configuration",
    allowedInCurrentRuntime: true,
    futureOnly: false,
    userCanAuthenticateInFuture: false,
    description: "Default current state. No enterprise IdP is configured and shipped auth remains unchanged."
  },
  configured_disabled: {
    id: "configured_disabled",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Configuration exists but cannot affect login until explicitly enabled in a future release."
  },
  metadata_pending: {
    id: "metadata_pending",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "IdP metadata or certificate material is incomplete, expired, or awaiting validation."
  },
  domain_verification_pending: {
    id: "domain_verification_pending",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Enterprise domain ownership has not been proven yet."
  },
  enabled: {
    id: "enabled",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: true,
    description: "Future state where enterprise SSO participates in login after all gates are implemented."
  },
  degraded: {
    id: "degraded",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: true,
    description: "Future state for partially available SSO with operator-visible recovery/runbook expectations."
  },
  suspended: {
    id: "suspended",
    category: "sso_configuration",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Future fail-closed state for security, billing, legal, or verified customer request reasons."
  },
  pending: {
    id: "pending",
    category: "scim_provisioning",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Future SCIM user has been received but is not active yet."
  },
  active: {
    id: "active",
    category: "scim_provisioning",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: true,
    description: "Future SCIM-managed user is active after role, organization, and entitlement checks."
  },
  soft_deprovisioned: {
    id: "soft_deprovisioned",
    category: "scim_provisioning",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Future reversible deprovisioning state that blocks login while retaining audit history."
  },
  hard_deprovisioned: {
    id: "hard_deprovisioned",
    category: "scim_provisioning",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Future terminal deprovisioning state after retention and audit requirements are satisfied."
  },
  locked: {
    id: "locked",
    category: "scim_provisioning",
    allowedInCurrentRuntime: false,
    futureOnly: true,
    userCanAuthenticateInFuture: false,
    description: "Future lockout state for security review or customer-requested recovery workflows."
  }
} as const;

export const ENTERPRISE_IDENTITY_LIFECYCLE_MODELS = [
  "login_lifecycle",
  "invite_lifecycle",
  "provisioning_lifecycle",
  "deprovisioning_lifecycle",
  "lockout_recovery_lifecycle",
  "domain_verification_lifecycle",
  "metadata_certificate_rotation_lifecycle",
  "fallback_admin_recovery_lifecycle"
] as const;

export type EnterpriseIdentityLifecycleModel =
  (typeof ENTERPRISE_IDENTITY_LIFECYCLE_MODELS)[number];

export type EnterpriseIdentityAuditEventName =
  | "enterprise.sso_configured"
  | "enterprise.sso_enabled"
  | "enterprise.sso_disabled"
  | "enterprise.idp_metadata_changed"
  | "enterprise.domain_verification_started"
  | "enterprise.domain_verification_completed"
  | "enterprise.domain_verification_failed"
  | "enterprise.scim_user_provisioned"
  | "enterprise.scim_user_deprovisioned"
  | "enterprise.role_group_mapping_changed"
  | "enterprise.admin_recovery_used"
  | "enterprise.user_lockout"
  | "enterprise.user_recovery";

export const ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS = [
  "raw_idp_assertion",
  "saml_response",
  "id_token",
  "access_token",
  "refresh_token",
  "authorization_code",
  "private_key",
  "client_secret",
  "x509_certificate",
  "raw_certificate",
  "scim_payload",
  "provider_payload",
  "provider_request",
  "provider_response",
  "password",
  "secret",
  "token"
] as const;

export type EnterpriseIdentityForbiddenAuditMetadataKey =
  (typeof ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS)[number];

export type EnterpriseIdentityAuditEventContract = {
  name: EnterpriseIdentityAuditEventName;
  status: "future";
  entityType: "enterprise_identity";
  allowedSafeMetadataKeys: readonly string[];
  forbiddenMetadataKeys: readonly EnterpriseIdentityForbiddenAuditMetadataKey[];
  requiredActorContext: "enterprise_admin" | "system_or_enterprise_admin";
  requiredPlanOrGate: "enterprise";
  notes: string;
};

const BASE_SAFE_METADATA_KEYS = [
  "request_id",
  "sso_configuration_id",
  "provider",
  "previous_state",
  "new_state",
  "domain",
  "domain_verification_status",
  "metadata_fingerprint",
  "certificate_fingerprint",
  "certificate_expires_at",
  "target_user_id",
  "scim_user_id",
  "mapping_id",
  "group_id_hash",
  "role",
  "reason_code",
  "recovery_method",
  "lockout_reason",
  "initiated_by"
] as const;

function auditContract(input: {
  name: EnterpriseIdentityAuditEventName;
  actor: EnterpriseIdentityAuditEventContract["requiredActorContext"];
  extraSafeMetadataKeys?: readonly string[];
  notes: string;
}): EnterpriseIdentityAuditEventContract {
  return {
    name: input.name,
    status: "future",
    entityType: "enterprise_identity",
    allowedSafeMetadataKeys: [
      ...BASE_SAFE_METADATA_KEYS,
      ...(input.extraSafeMetadataKeys ?? [])
    ],
    forbiddenMetadataKeys: ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
    requiredActorContext: input.actor,
    requiredPlanOrGate: "enterprise",
    notes: input.notes
  };
}

export const ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS: Record<
  EnterpriseIdentityAuditEventName,
  EnterpriseIdentityAuditEventContract
> = {
  "enterprise.sso_configured": auditContract({
    name: "enterprise.sso_configured",
    actor: "enterprise_admin",
    notes: "Future event when an enterprise admin creates or updates an SSO configuration shell."
  }),
  "enterprise.sso_enabled": auditContract({
    name: "enterprise.sso_enabled",
    actor: "enterprise_admin",
    notes: "Future event when SSO becomes eligible to participate in login."
  }),
  "enterprise.sso_disabled": auditContract({
    name: "enterprise.sso_disabled",
    actor: "enterprise_admin",
    notes: "Future event when SSO is disabled without exposing raw IdP details."
  }),
  "enterprise.idp_metadata_changed": auditContract({
    name: "enterprise.idp_metadata_changed",
    actor: "enterprise_admin",
    notes: "Future event for metadata URL, issuer, fingerprint, or certificate rotation changes."
  }),
  "enterprise.domain_verification_started": auditContract({
    name: "enterprise.domain_verification_started",
    actor: "enterprise_admin",
    notes: "Future event for starting domain proof without logging DNS secrets or provider payloads."
  }),
  "enterprise.domain_verification_completed": auditContract({
    name: "enterprise.domain_verification_completed",
    actor: "system_or_enterprise_admin",
    notes: "Future event for successful domain proof with safe domain/status evidence only."
  }),
  "enterprise.domain_verification_failed": auditContract({
    name: "enterprise.domain_verification_failed",
    actor: "system_or_enterprise_admin",
    notes: "Future event for failed domain proof using stable reason codes only."
  }),
  "enterprise.scim_user_provisioned": auditContract({
    name: "enterprise.scim_user_provisioned",
    actor: "system_or_enterprise_admin",
    notes: "Future event for SCIM-created or SCIM-reactivated users without full SCIM payloads."
  }),
  "enterprise.scim_user_deprovisioned": auditContract({
    name: "enterprise.scim_user_deprovisioned",
    actor: "system_or_enterprise_admin",
    notes: "Future event for soft or hard deprovisioning with state and reason code only."
  }),
  "enterprise.role_group_mapping_changed": auditContract({
    name: "enterprise.role_group_mapping_changed",
    actor: "enterprise_admin",
    notes: "Future event for group-to-role mapping changes; group names should be hashed or stable IDs."
  }),
  "enterprise.admin_recovery_used": auditContract({
    name: "enterprise.admin_recovery_used",
    actor: "enterprise_admin",
    notes: "Future break-glass recovery event with strong customer/support evidence and no secrets."
  }),
  "enterprise.user_lockout": auditContract({
    name: "enterprise.user_lockout",
    actor: "system_or_enterprise_admin",
    notes: "Future event when a user is locked because of deprovisioning, security review, or recovery policy."
  }),
  "enterprise.user_recovery": auditContract({
    name: "enterprise.user_recovery",
    actor: "enterprise_admin",
    notes: "Future event when a locked user is recovered through the approved enterprise admin path."
  })
} as const;

export type EnterpriseIdentityPackageGate = {
  moduleId: "enterprise_identity_rbac_retention";
  status: "deferred";
  minimumPlan: "enterprise";
  enabledForCurrentPlans: readonly [];
  forbiddenCurrentPlans: readonly ["free", "starter", "growth", "portfolio"];
  requiredFutureActions: readonly EnterpriseSensitiveActionId[];
  allowedCurrentRuntimeRoutes: readonly [];
  requiredDocs: readonly string[];
  requiredTestsOrReleaseGates: readonly string[];
};

export const ENTERPRISE_IDENTITY_PACKAGE_GATE: EnterpriseIdentityPackageGate = {
  moduleId: "enterprise_identity_rbac_retention",
  status: "deferred",
  minimumPlan: "enterprise",
  enabledForCurrentPlans: [],
  forbiddenCurrentPlans: ["free", "starter", "growth", "portfolio"],
  requiredFutureActions: [
    "future_sso_settings",
    "future_scim_provisioning",
    "future_permission_groups",
    "future_retention_settings",
    "future_admin_delegation"
  ],
  allowedCurrentRuntimeRoutes: [],
  requiredDocs: [
    "docs/enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md",
    "docs/enterprise/ENTERPRISE_ADMIN_IDENTITY_GUIDE.md",
    "docs/ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md"
  ],
  requiredTestsOrReleaseGates: [
    "tests/enterprise-identity-readiness.test.ts",
    "future enterprise identity release gate required before activation"
  ]
} as const;

export function isEnterpriseIdentityStateAllowedToday(
  state: EnterpriseSsoConfigurationState | EnterpriseProvisioningState
) {
  return ENTERPRISE_IDENTITY_STATE_REGISTRY[state].allowedInCurrentRuntime;
}

export function isEnterpriseIdentityAuditMetadataKeyAllowed(
  eventName: EnterpriseIdentityAuditEventName,
  key: string
) {
  const contract = ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS[eventName];
  return (
    contract.allowedSafeMetadataKeys.includes(key) &&
    !contract.forbiddenMetadataKeys.includes(key as EnterpriseIdentityForbiddenAuditMetadataKey)
  );
}

export function getEnterpriseIdentityPackagingGateEvidence() {
  return {
    module: PLATFORM_MODULES[ENTERPRISE_IDENTITY_PACKAGE_GATE.moduleId],
    ssoRule: ENTERPRISE_SENSITIVE_ACTION_RULES.future_sso_settings,
    scimRule: ENTERPRISE_SENSITIVE_ACTION_RULES.future_scim_provisioning,
    gate: ENTERPRISE_IDENTITY_PACKAGE_GATE
  };
}

