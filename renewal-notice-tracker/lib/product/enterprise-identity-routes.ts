import {
  ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS,
  ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
  ENTERPRISE_PROVISIONING_STATES,
  ENTERPRISE_SSO_CONFIGURATION_STATES,
  type EnterpriseIdentityAuditEventName,
  type EnterpriseProvisioningState,
  type EnterpriseSsoConfigurationState
} from "@/lib/product/enterprise-identity";
import type { EnterpriseSensitiveActionId } from "@/lib/product/enterprise-rbac";
import { ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS } from "@/lib/product/enterprise-identity-schema";

export type EnterpriseIdentityRouteId =
  | "get_sso_configuration"
  | "upsert_sso_configuration"
  | "upload_sso_metadata"
  | "start_domain_verification"
  | "test_sso_configuration"
  | "scim_create_user"
  | "scim_update_user"
  | "scim_delete_user"
  | "list_group_role_mappings"
  | "upsert_group_role_mapping"
  | "enterprise_admin_recovery";

export type EnterpriseIdentityRouteStatus = "deferred";
export type EnterpriseIdentityRouteMethod = "GET" | "POST" | "PATCH" | "DELETE";
export type EnterpriseIdentityValidationContractId =
  | "saml_metadata"
  | "oidc_issuer_client_metadata"
  | "domain_verification_request"
  | "sso_test_request"
  | "scim_user_create_payload"
  | "scim_user_update_payload"
  | "scim_user_delete_payload"
  | "group_role_mapping_payload"
  | "admin_recovery_payload";

export type EnterpriseIdentityRouteLifecycleState =
  | EnterpriseSsoConfigurationState
  | EnterpriseProvisioningState;

export type EnterpriseIdentityRouteContract = {
  id: EnterpriseIdentityRouteId;
  method: EnterpriseIdentityRouteMethod;
  path: string;
  status: EnterpriseIdentityRouteStatus;
  allowedRuntimeToday: false;
  requiredPlanOrGate: "enterprise";
  authBoundary:
    | "future_enterprise_admin_session"
    | "future_scim_bearer_token"
    | "future_enterprise_admin_break_glass";
  requiredRoleOrCapability: EnterpriseSensitiveActionId;
  lifecycleStateReferences: readonly EnterpriseIdentityRouteLifecycleState[];
  validationContractId: EnterpriseIdentityValidationContractId;
  rateLimitPolicy: string;
  idempotencyExpectation: string;
  auditEventName: EnterpriseIdentityAuditEventName;
  monitoringEventName: string;
  forbiddenFields: readonly string[];
  provisioningSemantics?: {
    operation: "create" | "update" | "soft_delete" | "admin_recovery";
    statesEntered: readonly EnterpriseProvisioningState[];
    deprovisioningState?: EnterpriseProvisioningState;
  };
  requiredTestsOrReleaseGates: readonly string[];
};

export type EnterpriseIdentityValidationContract = {
  id: EnterpriseIdentityValidationContractId;
  status: "future";
  allowedRuntimeToday: false;
  validates: string;
  safeInputFields: readonly string[];
  forbiddenInputFields: readonly string[];
  requiredRedactionBehavior: readonly string[];
  rejectRawProviderPayloads: true;
  auditLoggingConstraints: string;
  monitoringConstraints: string;
};

const commonRouteGates = [
  "tests/enterprise-identity-schema-routes.test.ts",
  "future enterprise identity route release gate required before activation"
] as const;

const forbiddenIdentityRouteFields = Array.from(
  new Set([
    ...ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
    ...ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS
  ])
).sort();

const ssoLifecycleReferences = ENTERPRISE_SSO_CONFIGURATION_STATES;
const scimLifecycleReferences = ENTERPRISE_PROVISIONING_STATES;

function enterpriseAdminRoute(input: Omit<EnterpriseIdentityRouteContract, "status" | "allowedRuntimeToday" | "requiredPlanOrGate" | "authBoundary" | "forbiddenFields" | "requiredTestsOrReleaseGates">): EnterpriseIdentityRouteContract {
  return {
    ...input,
    status: "deferred",
    allowedRuntimeToday: false,
    requiredPlanOrGate: "enterprise",
    authBoundary: "future_enterprise_admin_session",
    forbiddenFields: forbiddenIdentityRouteFields,
    requiredTestsOrReleaseGates: commonRouteGates
  };
}

function scimRoute(input: Omit<EnterpriseIdentityRouteContract, "status" | "allowedRuntimeToday" | "requiredPlanOrGate" | "authBoundary" | "forbiddenFields" | "requiredTestsOrReleaseGates">): EnterpriseIdentityRouteContract {
  return {
    ...input,
    status: "deferred",
    allowedRuntimeToday: false,
    requiredPlanOrGate: "enterprise",
    authBoundary: "future_scim_bearer_token",
    forbiddenFields: forbiddenIdentityRouteFields,
    requiredTestsOrReleaseGates: commonRouteGates
  };
}

export const ENTERPRISE_IDENTITY_ROUTE_CONTRACTS: Record<
  EnterpriseIdentityRouteId,
  EnterpriseIdentityRouteContract
> = {
  get_sso_configuration: enterpriseAdminRoute({
    id: "get_sso_configuration",
    method: "GET",
    path: "/api/enterprise/identity/sso/configuration",
    requiredRoleOrCapability: "future_sso_settings",
    lifecycleStateReferences: ssoLifecycleReferences,
    validationContractId: "saml_metadata",
    rateLimitPolicy: "future enterprise admin read limit; org-scoped and request-id logged",
    idempotencyExpectation: "read-only; no idempotency key required",
    auditEventName: "enterprise.sso_configured",
    monitoringEventName: "enterprise_identity_sso_configuration_viewed"
  }),
  upsert_sso_configuration: enterpriseAdminRoute({
    id: "upsert_sso_configuration",
    method: "POST",
    path: "/api/enterprise/identity/sso/configuration",
    requiredRoleOrCapability: "future_sso_settings",
    lifecycleStateReferences: ["configured_disabled", "metadata_pending", "domain_verification_pending"],
    validationContractId: "oidc_issuer_client_metadata",
    rateLimitPolicy: "strict future enterprise admin mutation limit per org and actor",
    idempotencyExpectation: "requires idempotency key for create/update attempts",
    auditEventName: "enterprise.sso_configured",
    monitoringEventName: "enterprise_identity_sso_configuration_changed"
  }),
  upload_sso_metadata: enterpriseAdminRoute({
    id: "upload_sso_metadata",
    method: "POST",
    path: "/api/enterprise/identity/sso/metadata",
    requiredRoleOrCapability: "future_sso_settings",
    lifecycleStateReferences: ["metadata_pending", "configured_disabled"],
    validationContractId: "saml_metadata",
    rateLimitPolicy: "strict future enterprise admin mutation limit per org and actor",
    idempotencyExpectation: "requires idempotency key and metadata fingerprint",
    auditEventName: "enterprise.idp_metadata_changed",
    monitoringEventName: "enterprise_identity_sso_metadata_changed"
  }),
  start_domain_verification: enterpriseAdminRoute({
    id: "start_domain_verification",
    method: "POST",
    path: "/api/enterprise/identity/sso/domain-verification",
    requiredRoleOrCapability: "future_sso_settings",
    lifecycleStateReferences: ["domain_verification_pending", "enabled", "suspended"],
    validationContractId: "domain_verification_request",
    rateLimitPolicy: "bounded per org/domain to prevent verification abuse",
    idempotencyExpectation: "requires idempotency key per organization/domain",
    auditEventName: "enterprise.domain_verification_started",
    monitoringEventName: "enterprise_identity_domain_verification_started"
  }),
  test_sso_configuration: enterpriseAdminRoute({
    id: "test_sso_configuration",
    method: "POST",
    path: "/api/enterprise/identity/sso/test",
    requiredRoleOrCapability: "future_sso_settings",
    lifecycleStateReferences: ssoLifecycleReferences,
    validationContractId: "sso_test_request",
    rateLimitPolicy: "low future test-attempt limit per actor/org/provider",
    idempotencyExpectation: "test attempts are not replayed as successful configuration changes",
    auditEventName: "enterprise.idp_metadata_changed",
    monitoringEventName: "enterprise_identity_sso_tested"
  }),
  scim_create_user: scimRoute({
    id: "scim_create_user",
    method: "POST",
    path: "/api/enterprise/identity/scim/v2/Users",
    requiredRoleOrCapability: "future_scim_provisioning",
    lifecycleStateReferences: scimLifecycleReferences,
    validationContractId: "scim_user_create_payload",
    rateLimitPolicy: "future SCIM token limit per organization/provider",
    idempotencyExpectation: "requires externalId or idempotency key; repeated creates must converge",
    auditEventName: "enterprise.scim_user_provisioned",
    monitoringEventName: "enterprise_identity_scim_user_provisioned",
    provisioningSemantics: {
      operation: "create",
      statesEntered: ["pending", "active"]
    }
  }),
  scim_update_user: scimRoute({
    id: "scim_update_user",
    method: "PATCH",
    path: "/api/enterprise/identity/scim/v2/Users/:id",
    requiredRoleOrCapability: "future_scim_provisioning",
    lifecycleStateReferences: scimLifecycleReferences,
    validationContractId: "scim_user_update_payload",
    rateLimitPolicy: "future SCIM token limit per organization/provider/user",
    idempotencyExpectation: "PATCH operations must be replay-safe by SCIM user id and version",
    auditEventName: "enterprise.scim_user_updated",
    monitoringEventName: "enterprise_identity_scim_user_updated",
    provisioningSemantics: {
      operation: "update",
      statesEntered: ["pending", "active", "locked"]
    }
  }),
  scim_delete_user: scimRoute({
    id: "scim_delete_user",
    method: "DELETE",
    path: "/api/enterprise/identity/scim/v2/Users/:id",
    requiredRoleOrCapability: "future_scim_provisioning",
    lifecycleStateReferences: scimLifecycleReferences,
    validationContractId: "scim_user_delete_payload",
    rateLimitPolicy: "future SCIM token limit per organization/provider/user",
    idempotencyExpectation: "DELETE is idempotent and defaults to soft deprovisioning",
    auditEventName: "enterprise.scim_user_deprovisioned",
    monitoringEventName: "enterprise_identity_scim_user_deprovisioned",
    provisioningSemantics: {
      operation: "soft_delete",
      statesEntered: ["soft_deprovisioned", "hard_deprovisioned", "locked"],
      deprovisioningState: "soft_deprovisioned"
    }
  }),
  list_group_role_mappings: enterpriseAdminRoute({
    id: "list_group_role_mappings",
    method: "GET",
    path: "/api/enterprise/identity/group-role-mappings",
    requiredRoleOrCapability: "future_permission_groups",
    lifecycleStateReferences: ["pending", "active", "locked"],
    validationContractId: "group_role_mapping_payload",
    rateLimitPolicy: "future enterprise admin read limit; org-scoped",
    idempotencyExpectation: "read-only; no idempotency key required",
    auditEventName: "enterprise.role_group_mapping_changed",
    monitoringEventName: "enterprise_identity_group_role_mappings_viewed"
  }),
  upsert_group_role_mapping: enterpriseAdminRoute({
    id: "upsert_group_role_mapping",
    method: "POST",
    path: "/api/enterprise/identity/group-role-mappings",
    requiredRoleOrCapability: "future_permission_groups",
    lifecycleStateReferences: ["pending", "active", "locked"],
    validationContractId: "group_role_mapping_payload",
    rateLimitPolicy: "strict future enterprise admin mutation limit per org and actor",
    idempotencyExpectation: "requires idempotency key per provider/group/role mapping",
    auditEventName: "enterprise.role_group_mapping_changed",
    monitoringEventName: "enterprise_identity_group_role_mapping_changed"
  }),
  enterprise_admin_recovery: {
    ...enterpriseAdminRoute({
      id: "enterprise_admin_recovery",
      method: "POST",
      path: "/api/enterprise/identity/admin-recovery",
      requiredRoleOrCapability: "future_admin_delegation",
      lifecycleStateReferences: ["locked", "soft_deprovisioned", "active"],
      validationContractId: "admin_recovery_payload",
      rateLimitPolicy: "P0 break-glass limit with explicit support/customer evidence",
      idempotencyExpectation: "requires idempotency key and recovery evidence id",
      auditEventName: "enterprise.admin_recovery_used",
      monitoringEventName: "enterprise_identity_admin_recovery_used",
      provisioningSemantics: {
        operation: "admin_recovery",
        statesEntered: ["active", "locked"]
      }
    }),
    authBoundary: "future_enterprise_admin_break_glass"
  }
} as const;

export const ENTERPRISE_IDENTITY_ROUTE_IDS = Object.keys(
  ENTERPRISE_IDENTITY_ROUTE_CONTRACTS
) as EnterpriseIdentityRouteId[];

export const ENTERPRISE_IDENTITY_VALIDATION_CONTRACTS: Record<
  EnterpriseIdentityValidationContractId,
  EnterpriseIdentityValidationContract
> = {
  saml_metadata: {
    id: "saml_metadata",
    status: "future",
    allowedRuntimeToday: false,
    validates: "SAML metadata URL/fingerprint/certificate expiry without retaining raw XML.",
    safeInputFields: ["provider", "metadata_url", "metadata_fingerprint", "certificate_fingerprint", "certificate_expires_at"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["replace raw XML/assertions/certificates with fingerprints", "store secret references only"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit fingerprints, expiry, state, actor, and request ID only.",
    monitoringConstraints: "Monitor stable validation result codes only."
  },
  oidc_issuer_client_metadata: {
    id: "oidc_issuer_client_metadata",
    status: "future",
    allowedRuntimeToday: false,
    validates: "OIDC issuer, audience/client identifier, redirect policy, and secret references.",
    safeInputFields: ["provider", "issuer", "client_id", "redirect_uri", "metadata_fingerprint"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["redact client secrets", "log issuer/client metadata only after normalization"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit issuer/fingerprint/state only; no client secret or token values.",
    monitoringConstraints: "Monitor stable provider/config result codes only."
  },
  domain_verification_request: {
    id: "domain_verification_request",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Domain ownership request and proof fingerprint.",
    safeInputFields: ["domain", "verification_method", "verification_token_fingerprint"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["hash verification tokens", "redact DNS proof values"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit domain, method, status, and reason code only.",
    monitoringConstraints: "Monitor repeated failures by domain hash or organization only."
  },
  sso_test_request: {
    id: "sso_test_request",
    status: "future",
    allowedRuntimeToday: false,
    validates: "SSO test attempt result without storing login assertions.",
    safeInputFields: ["provider", "sso_configuration_id", "request_id", "test_result_code"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["discard assertions", "log only stable test result code and fingerprints"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit test attempt status and result code only.",
    monitoringConstraints: "Monitor repeated failed tests without assertion payloads."
  },
  scim_user_create_payload: {
    id: "scim_user_create_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "SCIM create normalized to external ID, user identity hash, and role/group mapping refs.",
    safeInputFields: ["external_id_hash", "email_hash", "target_user_id", "group_id_hash", "role"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["hash raw emails where possible", "discard full SCIM body after normalization"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit target user IDs, hashes, state, role, and reason code only.",
    monitoringConstraints: "Monitor provisioning result code and organization/provider only."
  },
  scim_user_update_payload: {
    id: "scim_user_update_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "SCIM PATCH operations normalized to supported lifecycle and role changes.",
    safeInputFields: ["scim_user_id", "target_user_id", "provisioning_state", "group_id_hash", "role"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["discard raw patch operations", "store state deltas and stable reason codes only"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit lifecycle transition and safe target identifiers only.",
    monitoringConstraints: "Monitor result code; no patch payload."
  },
  scim_user_delete_payload: {
    id: "scim_user_delete_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "SCIM DELETE mapped to soft or hard deprovisioning policy.",
    safeInputFields: ["scim_user_id", "target_user_id", "deprovisioning_state", "reason_code"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["do not log raw SCIM delete request", "record soft-delete reason code"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit deprovisioning state, target user, and reason code only.",
    monitoringConstraints: "Monitor deprovisioning failures by code only."
  },
  group_role_mapping_payload: {
    id: "group_role_mapping_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Provider group-to-role mapping using hashed group IDs and allowed role IDs.",
    safeInputFields: ["provider", "group_id_hash", "role", "mapping_state", "priority"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["hash provider group identifiers", "discard raw group claims"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit hashed group ID, role, state, and actor only.",
    monitoringConstraints: "Monitor invalid mapping attempts by stable reason code only."
  },
  admin_recovery_payload: {
    id: "admin_recovery_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Break-glass enterprise admin recovery evidence and target state.",
    safeInputFields: ["target_user_id", "recovery_method", "reason_code", "request_id", "initiated_by"],
    forbiddenInputFields: forbiddenIdentityRouteFields,
    requiredRedactionBehavior: ["redact support notes and provider evidence", "store safe evidence IDs only"],
    rejectRawProviderPayloads: true,
    auditLoggingConstraints: "Audit recovery method, target user, actor, and reason code only.",
    monitoringConstraints: "Always monitor as P0/P1 candidate without raw evidence."
  }
} as const;

export const ENTERPRISE_IDENTITY_VALIDATION_CONTRACT_IDS = Object.keys(
  ENTERPRISE_IDENTITY_VALIDATION_CONTRACTS
) as EnterpriseIdentityValidationContractId[];

export function getEnterpriseIdentityRouteContract(routeId: EnterpriseIdentityRouteId) {
  return ENTERPRISE_IDENTITY_ROUTE_CONTRACTS[routeId];
}
