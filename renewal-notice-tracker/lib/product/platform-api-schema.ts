import type {
  FutureApiScope,
  PlatformApiAuthenticationModel,
  PlatformApiCapabilityId
} from "@/lib/product/platform-api";

export type PlatformApiSchemaStatus = "deferred" | "future";

export type PlatformApiSchemaTableId =
  | "api_tokens"
  | "api_token_events"
  | "oauth_connections"
  | "integration_connections"
  | "customer_webhook_endpoints"
  | "customer_webhook_deliveries"
  | "integration_event_ledger"
  | "integration_sync_jobs";

export const PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS = [
  "raw_api_token",
  "api_token_secret",
  "api_key_secret",
  "internal_route_secret",
  "cron_secret",
  "destructive_operation_secret",
  "billing_webhook_secret",
  "monitoring_webhook_secret",
  "webhook_signing_secret",
  "oauth_client_secret",
  "oauth_access_token",
  "oauth_refresh_token",
  "oauth_authorization_code",
  "oauth_id_token",
  "provider_payload",
  "provider_request",
  "provider_response",
  "raw_webhook_payload",
  "raw_contract_text",
  "ocr_output",
  "raw_extracted_evidence",
  "full_note_text",
  "storage_path",
  "uploaded_document_contents",
  "payment_provider_payload",
  "debug_trace",
  "password",
  "secret",
  "token"
] as const;

export type PlatformApiSchemaForbiddenRawField =
  (typeof PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS)[number];

export type PlatformApiSchemaTableContract = {
  id: PlatformApiSchemaTableId;
  status: PlatformApiSchemaStatus;
  allowedInCurrentRuntime: false;
  organizationIdRequired: true;
  ownerUserField?: "created_by_user_id" | "actor_user_id" | "requested_by_user_id";
  lifecycleField: string;
  lifecycleStates: readonly string[];
  owningCapabilities: readonly PlatformApiCapabilityId[];
  authenticationModels: readonly PlatformApiAuthenticationModel[];
  requiredScopes: readonly FutureApiScope[];
  safeMetadataFields: readonly string[];
  forbiddenRawFields: readonly PlatformApiSchemaForbiddenRawField[];
  secretOrTokenStorageAssumption: string;
  timestampFields: readonly string[];
  uniquenessConstraints: readonly string[];
  requiredIndexes: readonly string[];
  deletionOrRevocationBehavior: string;
  auditEventLinkage: readonly string[];
  monitoringEventLinkage: readonly string[];
  requiredTestsOrReleaseGates: readonly string[];
};

const commonApiSchemaGates = [
  "tests/platform-api-schema-routes.test.ts",
  "future public API/integration release gate required before activation"
] as const;

const commonTimestampFields = ["created_at", "updated_at"] as const;

export const PLATFORM_API_SCHEMA_TABLES: Record<
  PlatformApiSchemaTableId,
  PlatformApiSchemaTableContract
> = {
  api_tokens: {
    id: "api_tokens",
    status: "deferred",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "created_by_user_id",
    lifecycleField: "token_status",
    lifecycleStates: ["pending", "active", "rotated", "revoked", "expired", "suspended"],
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    authenticationModels: ["future_org_scoped_api_key", "future_scoped_api_token"],
    requiredScopes: ["contracts:read", "exports:read", "renewals:read", "admin:read"],
    safeMetadataFields: [
      "organization_id",
      "created_by_user_id",
      "token_prefix",
      "token_fingerprint",
      "token_status",
      "scope_ids",
      "last_used_at",
      "expires_at",
      "revoked_at",
      "rate_limit_policy_id"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Raw token value is shown once, hashed before storage, and never logged; only prefix/fingerprint may appear in support diagnostics.",
    timestampFields: [...commonTimestampFields, "last_used_at", "expires_at", "revoked_at"] as const,
    uniquenessConstraints: ["organization_id + token_fingerprint", "organization_id + token_prefix"],
    requiredIndexes: [
      "organization_id, token_status",
      "organization_id, token_prefix",
      "organization_id, last_used_at desc"
    ],
    deletionOrRevocationBehavior:
      "Revoke before delete; deletion must preserve token event/audit evidence and cannot reuse internal route secrets.",
    auditEventLinkage: ["api_token.created", "api_token.rotated", "api_token.revoked"],
    monitoringEventLinkage: ["platform_api_token_auth_failed", "platform_api_token_rate_limited"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  api_token_events: {
    id: "api_token_events",
    status: "deferred",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "actor_user_id",
    lifecycleField: "event_type",
    lifecycleStates: ["created", "rotated", "revoked", "used", "denied", "rate_limited"],
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    authenticationModels: ["future_org_scoped_api_key", "future_scoped_api_token"],
    requiredScopes: ["admin:read", "admin:write"],
    safeMetadataFields: [
      "organization_id",
      "actor_user_id",
      "token_prefix",
      "token_fingerprint",
      "event_type",
      "scope_ids",
      "request_id",
      "reason_code",
      "ip_fingerprint"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Token events may reference token fingerprints only; no raw token or authorization header material is retained.",
    timestampFields: [...commonTimestampFields, "occurred_at"] as const,
    uniquenessConstraints: ["organization_id + request_id + event_type"],
    requiredIndexes: [
      "organization_id, occurred_at desc",
      "organization_id, token_fingerprint",
      "organization_id, event_type"
    ],
    deletionOrRevocationBehavior:
      "Retain according to audit retention policy; token event deletion must not hide revoked-token evidence.",
    auditEventLinkage: ["api_token.created", "api_token.rotated", "api_token.revoked", "api_token.denied"],
    monitoringEventLinkage: ["platform_api_token_denied", "platform_api_token_abuse_suspected"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  oauth_connections: {
    id: "oauth_connections",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "created_by_user_id",
    lifecycleField: "connection_status",
    lifecycleStates: ["pending_state_verification", "active", "refresh_required", "revoked", "failed", "suspended"],
    owningCapabilities: [
      "oauth_app_connections",
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations"
    ],
    authenticationModels: ["future_oauth_connection"],
    requiredScopes: ["integrations:manage", "admin:read"],
    safeMetadataFields: [
      "organization_id",
      "created_by_user_id",
      "provider",
      "connection_status",
      "provider_account_id_hash",
      "requested_scope_ids",
      "granted_scope_ids",
      "token_reference_id",
      "state_nonce_hash",
      "expires_at",
      "last_refreshed_at"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "OAuth access/refresh tokens and client secrets must live in encrypted secret storage; the table stores references, fingerprints, scopes, and status only.",
    timestampFields: [...commonTimestampFields, "expires_at", "last_refreshed_at", "revoked_at"] as const,
    uniquenessConstraints: ["organization_id + provider + provider_account_id_hash"],
    requiredIndexes: [
      "organization_id, provider",
      "organization_id, connection_status",
      "expires_at where connection_status = 'active'"
    ],
    deletionOrRevocationBehavior:
      "Revoke provider tokens before disconnecting; disconnect preserves audit history and safe provider account hash.",
    auditEventLinkage: ["oauth_connection.created", "oauth_connection.scope_changed", "oauth_connection.revoked"],
    monitoringEventLinkage: ["platform_oauth_callback_failed", "platform_oauth_refresh_failed"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  integration_connections: {
    id: "integration_connections",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "created_by_user_id",
    lifecycleField: "integration_status",
    lifecycleStates: ["configured_disabled", "active", "degraded", "revoked", "failed", "suspended"],
    owningCapabilities: [
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations",
      "data_warehouse_export"
    ],
    authenticationModels: ["future_oauth_connection", "future_scoped_api_token"],
    requiredScopes: ["integrations:manage", "renewals:read", "contracts:read"],
    safeMetadataFields: [
      "organization_id",
      "created_by_user_id",
      "provider",
      "integration_status",
      "oauth_connection_id",
      "destination_fingerprint",
      "sync_policy_id",
      "last_sync_at",
      "last_success_at",
      "failure_code"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Provider credentials are referenced through OAuth or secret storage; integration config stores safe provider/destination fingerprints only.",
    timestampFields: [...commonTimestampFields, "last_sync_at", "last_success_at", "disabled_at"] as const,
    uniquenessConstraints: ["organization_id + provider + destination_fingerprint"],
    requiredIndexes: [
      "organization_id, provider",
      "organization_id, integration_status",
      "organization_id, last_sync_at desc"
    ],
    deletionOrRevocationBehavior:
      "Disable before deletion; no integration may mutate core contract truth outside review/trust gates.",
    auditEventLinkage: ["integration_connection.created", "integration_connection.disabled", "integration_connection.revoked"],
    monitoringEventLinkage: ["platform_integration_sync_failed", "platform_integration_connection_degraded"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  customer_webhook_endpoints: {
    id: "customer_webhook_endpoints",
    status: "deferred",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "created_by_user_id",
    lifecycleField: "endpoint_status",
    lifecycleStates: ["pending_verification", "active", "disabled", "failed", "revoked"],
    owningCapabilities: ["outbound_webhooks"],
    authenticationModels: ["future_signed_customer_webhook"],
    requiredScopes: ["webhooks:manage"],
    safeMetadataFields: [
      "organization_id",
      "created_by_user_id",
      "endpoint_status",
      "endpoint_url_origin",
      "endpoint_url_fingerprint",
      "signing_secret_reference_id",
      "event_type_ids",
      "last_verified_at",
      "disabled_at",
      "failure_code"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Webhook signing secrets must be encrypted and referenced by ID; endpoint URLs may be fingerprinted/origin-normalized for support views.",
    timestampFields: [...commonTimestampFields, "last_verified_at", "disabled_at"] as const,
    uniquenessConstraints: ["organization_id + endpoint_url_fingerprint"],
    requiredIndexes: [
      "organization_id, endpoint_status",
      "organization_id, endpoint_url_fingerprint",
      "organization_id, updated_at desc"
    ],
    deletionOrRevocationBehavior:
      "Disable endpoint before delete; secret rotation and delivery halt must be audited.",
    auditEventLinkage: ["customer_webhook_endpoint.created", "customer_webhook_endpoint.updated", "customer_webhook_endpoint.deleted"],
    monitoringEventLinkage: ["platform_customer_webhook_endpoint_failed", "platform_customer_webhook_signing_failed"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  customer_webhook_deliveries: {
    id: "customer_webhook_deliveries",
    status: "deferred",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "delivery_status",
    lifecycleStates: ["queued", "delivering", "delivered", "retry_pending", "failed", "expired"],
    owningCapabilities: ["outbound_webhooks"],
    authenticationModels: ["future_signed_customer_webhook"],
    requiredScopes: ["webhooks:manage"],
    safeMetadataFields: [
      "organization_id",
      "customer_webhook_endpoint_id",
      "event_id",
      "delivery_status",
      "idempotency_key",
      "attempt_count",
      "response_status",
      "failure_code",
      "next_retry_at",
      "delivered_at",
      "payload_schema_version"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Delivery rows store event IDs, schemas, status, and failure codes only; signed payload body is reconstructed from safe event data when needed.",
    timestampFields: [...commonTimestampFields, "next_retry_at", "delivered_at", "expired_at"] as const,
    uniquenessConstraints: ["organization_id + customer_webhook_endpoint_id + event_id"],
    requiredIndexes: [
      "organization_id, delivery_status",
      "organization_id, next_retry_at",
      "organization_id, event_id"
    ],
    deletionOrRevocationBehavior:
      "Expired delivery artifacts may be purged, but delivery status/failure evidence remains code-first and customer-content-free.",
    auditEventLinkage: ["customer_webhook_delivery.failed", "customer_webhook_delivery.disabled_endpoint"],
    monitoringEventLinkage: ["platform_customer_webhook_delivery_failed", "platform_customer_webhook_delivery_expired"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  integration_event_ledger: {
    id: "integration_event_ledger",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    lifecycleField: "event_status",
    lifecycleStates: ["received", "verified", "processed", "ignored_duplicate", "failed", "expired"],
    owningCapabilities: ["inbound_webhooks", "oauth_app_connections", "crm_procurement_accounting_integrations"],
    authenticationModels: ["provider_specific_existing_webhook", "future_oauth_connection"],
    requiredScopes: ["integrations:manage", "webhooks:manage"],
    safeMetadataFields: [
      "organization_id",
      "provider",
      "provider_event_id_hash",
      "event_status",
      "event_type",
      "idempotency_key",
      "request_id",
      "failure_code",
      "processed_at"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Provider payloads are normalized into event IDs, type, hashes, status, and failure codes; raw payloads are forbidden.",
    timestampFields: [...commonTimestampFields, "received_at", "processed_at", "expired_at"] as const,
    uniquenessConstraints: ["organization_id + provider + provider_event_id_hash"],
    requiredIndexes: [
      "organization_id, provider, event_status",
      "organization_id, received_at desc",
      "organization_id, provider_event_id_hash"
    ],
    deletionOrRevocationBehavior:
      "Ledger expiry may remove transient payload references only; replay/idempotency evidence remains safe and bounded.",
    auditEventLinkage: ["integration_event.received", "integration_event.processed", "integration_event.failed"],
    monitoringEventLinkage: ["platform_integration_webhook_failed", "platform_integration_replay_detected"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  },
  integration_sync_jobs: {
    id: "integration_sync_jobs",
    status: "future",
    allowedInCurrentRuntime: false,
    organizationIdRequired: true,
    ownerUserField: "requested_by_user_id",
    lifecycleField: "job_status",
    lifecycleStates: ["queued", "processing", "completed", "retry_pending", "failed", "cancelled", "expired"],
    owningCapabilities: [
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations",
      "data_warehouse_export"
    ],
    authenticationModels: ["future_oauth_connection", "future_scoped_api_token"],
    requiredScopes: ["integrations:manage", "exports:write"],
    safeMetadataFields: [
      "organization_id",
      "requested_by_user_id",
      "integration_connection_id",
      "provider",
      "job_status",
      "job_type",
      "idempotency_key",
      "attempt_count",
      "failure_code",
      "started_at",
      "completed_at",
      "row_count"
    ],
    forbiddenRawFields: PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    secretOrTokenStorageAssumption:
      "Sync jobs reference connection credentials indirectly; job evidence must not include provider payloads or exported customer content.",
    timestampFields: [...commonTimestampFields, "started_at", "completed_at", "next_retry_at"] as const,
    uniquenessConstraints: ["organization_id + integration_connection_id + idempotency_key"],
    requiredIndexes: [
      "organization_id, job_status",
      "organization_id, provider, job_status",
      "organization_id, next_retry_at"
    ],
    deletionOrRevocationBehavior:
      "Cancelling or expiring a job must preserve safe failure/status evidence without provider payloads.",
    auditEventLinkage: ["integration_sync.requested", "integration_sync.completed", "integration_sync.failed"],
    monitoringEventLinkage: ["platform_integration_sync_failed", "platform_integration_sync_stale"],
    requiredTestsOrReleaseGates: commonApiSchemaGates
  }
} as const;

export const PLATFORM_API_SCHEMA_TABLE_IDS = Object.keys(
  PLATFORM_API_SCHEMA_TABLES
) as PlatformApiSchemaTableId[];

export function isPlatformApiSchemaSafeMetadataField(
  tableId: PlatformApiSchemaTableId,
  field: string
) {
  const table = PLATFORM_API_SCHEMA_TABLES[tableId];
  return (
    table.safeMetadataFields.includes(field) &&
    !table.forbiddenRawFields.includes(field as PlatformApiSchemaForbiddenRawField)
  );
}
