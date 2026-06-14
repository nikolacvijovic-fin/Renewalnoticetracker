import {
  ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS,
  ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
  ENTERPRISE_PROVISIONING_STATES,
  ENTERPRISE_SSO_CONFIGURATION_STATES,
  type EnterpriseIdentityAuditEventName,
  type EnterpriseIdentityProvider,
  type EnterpriseProvisioningState,
  type EnterpriseSsoConfigurationState
} from "@/lib/product/enterprise-identity";

export type EnterpriseIdentitySchemaTableId =
  | "enterprise_sso_configurations"
  | "enterprise_verified_domains"
  | "enterprise_scim_users"
  | "enterprise_group_role_mappings"
  | "enterprise_identity_events";

export type EnterpriseIdentitySchemaStatus = "future";

export type EnterpriseIdentitySchemaProvider =
  | EnterpriseIdentityProvider
  | "scim_2_0"
  | "manual_enterprise_admin";

export type EnterpriseIdentityLifecycleState =
  | EnterpriseSsoConfigurationState
  | EnterpriseProvisioningState;

export const ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS = [
  ...ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
  "raw_saml_metadata_xml",
  "raw_saml_assertion",
  "raw_saml_response",
  "raw_oidc_id_token",
  "raw_oidc_userinfo",
  "raw_scim_payload",
  "raw_directory_payload",
  "full_scim_payload",
  "provider_payload",
  "provider_secret",
  "client_secret_plaintext",
  "private_key_pem",
  "x509_certificate_pem",
  "storage_path",
  "debug_trace",
  "password_hash"
] as const;

export type EnterpriseIdentitySchemaForbiddenRawField =
  (typeof ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS)[number];

export type EnterpriseIdentitySchemaTableContract = {
  id: EnterpriseIdentitySchemaTableId;
  status: EnterpriseIdentitySchemaStatus;
  allowedInCurrentRuntime: false;
  organizationIdRequired: true;
  lifecycleField: string;
  lifecycleStates: readonly EnterpriseIdentityLifecycleState[];
  providerTypes: readonly EnterpriseIdentitySchemaProvider[];
  safeMetadataFields: readonly string[];
  forbiddenRawFields: readonly EnterpriseIdentitySchemaForbiddenRawField[];
  secretOrCertificateStorageAssumption: string;
  timestampFields: readonly string[];
  uniquenessConstraints: readonly string[];
  requiredIndexes: readonly string[];
  deletionOrDeprovisioningBehavior: string;
  auditEventLinkage: readonly EnterpriseIdentityAuditEventName[];
  requiredTestsOrReleaseGates: readonly string[];
};

const commonReleaseGates = [
  "tests/enterprise-identity-schema-routes.test.ts",
  "future enterprise identity release gate required before activation"
] as const;

const commonTimestampFields = ["created_at", "updated_at"] as const;

const safeIdentityEventMetadata = Array.from(
  new Set(
    Object.values(ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS).flatMap(
      (contract) => contract.allowedSafeMetadataKeys
    )
  )
).sort();

const allLifecycleStates = [
  ...ENTERPRISE_SSO_CONFIGURATION_STATES,
  ...ENTERPRISE_PROVISIONING_STATES
] as const;

export const ENTERPRISE_IDENTITY_SCHEMA_TABLES: Record<
  EnterpriseIdentitySchemaTableId,
  EnterpriseIdentitySchemaTableContract
> = {
  enterprise_sso_configurations: {
    id: "enterprise_sso_configurations",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "sso_lifecycle_state",
    lifecycleStates: ENTERPRISE_SSO_CONFIGURATION_STATES,
    providerTypes: ["saml_2_0", "oidc"],
    safeMetadataFields: [
      "organization_id",
      "provider",
      "sso_lifecycle_state",
      "issuer",
      "metadata_url",
      "metadata_fingerprint",
      "certificate_fingerprint",
      "certificate_expires_at",
      "domain_verification_status",
      "last_tested_at",
      "last_test_result_code",
      "created_by_user_id",
      "updated_by_user_id"
    ],
    forbiddenRawFields: ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrCertificateStorageAssumption:
      "Raw certificates, private keys, and client secrets must live in encrypted secret storage or KMS-backed storage; the table may store fingerprints, expiry, and secret references only.",
    timestampFields: [...commonTimestampFields, "last_tested_at", "disabled_at"] as const,
    uniquenessConstraints: [
      "organization_id + provider",
      "organization_id + provider + issuer where issuer is not null"
    ],
    requiredIndexes: [
      "organization_id, sso_lifecycle_state",
      "organization_id, provider",
      "certificate_expires_at where certificate_expires_at is not null"
    ],
    deletionOrDeprovisioningBehavior:
      "Disable before delete; hard deletion requires audit evidence and separate secret revocation/wipe confirmation.",
    auditEventLinkage: [
      "enterprise.sso_configured",
      "enterprise.sso_enabled",
      "enterprise.sso_disabled",
      "enterprise.idp_metadata_changed"
    ],
    requiredTestsOrReleaseGates: commonReleaseGates
  },
  enterprise_verified_domains: {
    id: "enterprise_verified_domains",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "domain_verification_state",
    lifecycleStates: ["domain_verification_pending", "enabled", "suspended"],
    providerTypes: ["saml_2_0", "oidc"],
    safeMetadataFields: [
      "organization_id",
      "domain",
      "domain_verification_state",
      "verification_method",
      "verification_token_fingerprint",
      "last_checked_at",
      "verified_at",
      "reason_code"
    ],
    forbiddenRawFields: ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrCertificateStorageAssumption:
      "DNS proof values and verification tokens must be stored as fingerprints or secret references, never as broadly visible plaintext.",
    timestampFields: [...commonTimestampFields, "last_checked_at", "verified_at"] as const,
    uniquenessConstraints: [
      "lower(domain) is globally unique while verified",
      "organization_id + lower(domain)"
    ],
    requiredIndexes: [
      "organization_id, domain_verification_state",
      "lower(domain)",
      "last_checked_at where domain_verification_state = 'domain_verification_pending'"
    ],
    deletionOrDeprovisioningBehavior:
      "Domain release requires audit evidence; deleting a domain must suspend related SSO routing before removing proof records.",
    auditEventLinkage: [
      "enterprise.domain_verification_started",
      "enterprise.domain_verification_completed",
      "enterprise.domain_verification_failed"
    ],
    requiredTestsOrReleaseGates: commonReleaseGates
  },
  enterprise_scim_users: {
    id: "enterprise_scim_users",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "provisioning_state",
    lifecycleStates: ENTERPRISE_PROVISIONING_STATES,
    providerTypes: ["scim_2_0"],
    safeMetadataFields: [
      "organization_id",
      "target_user_id",
      "scim_user_id",
      "external_id_hash",
      "email_hash",
      "provisioning_state",
      "role",
      "last_provisioned_at",
      "deprovisioned_at",
      "reason_code"
    ],
    forbiddenRawFields: ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrCertificateStorageAssumption:
      "SCIM bearer credentials must be stored outside this table; raw SCIM payloads are not retained here.",
    timestampFields: [
      ...commonTimestampFields,
      "last_provisioned_at",
      "deprovisioned_at",
      "locked_at"
    ] as const,
    uniquenessConstraints: [
      "organization_id + scim_user_id",
      "organization_id + external_id_hash",
      "organization_id + target_user_id where target_user_id is not null"
    ],
    requiredIndexes: [
      "organization_id, provisioning_state",
      "organization_id, updated_at desc",
      "organization_id, target_user_id"
    ],
    deletionOrDeprovisioningBehavior:
      "Default DELETE semantics are soft_deprovisioned; hard_deprovisioned requires retention/audit gates and must preserve historical accountability references.",
    auditEventLinkage: [
      "enterprise.scim_user_provisioned",
      "enterprise.scim_user_deprovisioned",
      "enterprise.user_lockout",
      "enterprise.user_recovery"
    ],
    requiredTestsOrReleaseGates: commonReleaseGates
  },
  enterprise_group_role_mappings: {
    id: "enterprise_group_role_mappings",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "mapping_state",
    lifecycleStates: ["pending", "active", "locked"],
    providerTypes: ["saml_2_0", "oidc", "scim_2_0"],
    safeMetadataFields: [
      "organization_id",
      "provider",
      "mapping_state",
      "group_id_hash",
      "role",
      "priority",
      "last_applied_at",
      "reason_code"
    ],
    forbiddenRawFields: ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrCertificateStorageAssumption:
      "Group claims and provider payloads are normalized into hashed group IDs and role IDs only.",
    timestampFields: [...commonTimestampFields, "last_applied_at", "disabled_at"] as const,
    uniquenessConstraints: ["organization_id + provider + group_id_hash"],
    requiredIndexes: [
      "organization_id, provider",
      "organization_id, mapping_state",
      "organization_id, role"
    ],
    deletionOrDeprovisioningBehavior:
      "Disable mappings before removal; removing a mapping must not silently elevate users or bypass shipped role checks.",
    auditEventLinkage: ["enterprise.role_group_mapping_changed"],
    requiredTestsOrReleaseGates: commonReleaseGates
  },
  enterprise_identity_events: {
    id: "enterprise_identity_events",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "event_lifecycle_state",
    lifecycleStates: allLifecycleStates,
    providerTypes: ["saml_2_0", "oidc", "scim_2_0", "manual_enterprise_admin"],
    safeMetadataFields: [
      "organization_id",
      "audit_event_id",
      "event_name",
      "event_lifecycle_state",
      "actor_user_id",
      "target_user_id",
      "request_id",
      "reason_code",
      ...safeIdentityEventMetadata
    ],
    forbiddenRawFields: ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrCertificateStorageAssumption:
      "Identity events may link to audit rows and safe fingerprints only; raw assertions, certificates, tokens, and provider payloads are forbidden.",
    timestampFields: [...commonTimestampFields, "occurred_at"] as const,
    uniquenessConstraints: ["organization_id + audit_event_id", "organization_id + event_name + occurred_at + request_id"],
    requiredIndexes: [
      "organization_id, occurred_at desc",
      "organization_id, event_name",
      "organization_id, event_lifecycle_state"
    ],
    deletionOrDeprovisioningBehavior:
      "Retain according to audit retention policy; never use event deletion to hide provisioning or recovery evidence.",
    auditEventLinkage: Object.keys(
      ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS
    ) as EnterpriseIdentityAuditEventName[],
    requiredTestsOrReleaseGates: commonReleaseGates
  }
} as const;

export const ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS = Object.keys(
  ENTERPRISE_IDENTITY_SCHEMA_TABLES
) as EnterpriseIdentitySchemaTableId[];

export function isEnterpriseIdentitySchemaSafeMetadataField(
  tableId: EnterpriseIdentitySchemaTableId,
  field: string
) {
  const contract = ENTERPRISE_IDENTITY_SCHEMA_TABLES[tableId];
  return (
    contract.safeMetadataFields.includes(field) &&
    !contract.forbiddenRawFields.includes(field as EnterpriseIdentitySchemaForbiddenRawField)
  );
}
