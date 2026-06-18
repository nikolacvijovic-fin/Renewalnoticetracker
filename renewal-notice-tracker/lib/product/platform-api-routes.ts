import type {
  FutureApiScope,
  PlatformApiAuthenticationModel,
  PlatformApiCapabilityId
} from "@/lib/product/platform-api";
import type { EnterpriseSensitiveActionId } from "@/lib/product/enterprise-rbac";
import { PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS } from "@/lib/product/platform-api-schema";

export type PlatformApiRouteStatus = "deferred" | "future";
export type PlatformApiRouteMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type PlatformApiRouteId =
  | "list_contracts"
  | "read_contract"
  | "create_export"
  | "read_export"
  | "list_audit_events"
  | "create_webhook_endpoint"
  | "update_webhook_endpoint"
  | "delete_webhook_endpoint"
  | "create_api_token"
  | "rotate_api_token"
  | "revoke_api_token"
  | "list_integrations"
  | "oauth_callback"
  | "trigger_integration_sync"
  | "provider_webhook_callback";

export type PlatformApiValidationContractId =
  | "api_token_create"
  | "api_token_rotate"
  | "api_token_revoke"
  | "contract_list_query"
  | "contract_read_query"
  | "export_job_create"
  | "export_job_read"
  | "audit_event_list_query"
  | "webhook_endpoint_create"
  | "webhook_endpoint_update"
  | "webhook_endpoint_delete"
  | "oauth_callback"
  | "integration_sync_request"
  | "provider_webhook_payload";

export type PlatformApiRouteAuthModel =
  | PlatformApiAuthenticationModel
  | "future_enterprise_admin_session"
  | "future_provider_signed_webhook";

export type PlatformApiRouteContract = {
  id: PlatformApiRouteId;
  method: PlatformApiRouteMethod;
  path: string;
  status: PlatformApiRouteStatus;
  allowedRuntimeToday: false;
  requiredAuthModel: PlatformApiRouteAuthModel;
  requiredScopes: readonly FutureApiScope[];
  requiredRoleOrCapability: EnterpriseSensitiveActionId;
  owningCapabilities: readonly PlatformApiCapabilityId[];
  validationContractId: PlatformApiValidationContractId;
  rateLimitPolicy: string;
  idempotencyExpectation: string;
  paginationExpectation?: string;
  auditEventExpectation: string;
  monitoringEventExpectation: string;
  forbiddenRequestLogAuditFields: readonly string[];
  requiredSecurityControls: readonly string[];
  requiredTestsOrReleaseGates: readonly string[];
};

export type PlatformApiValidationContract = {
  id: PlatformApiValidationContractId;
  status: "deferred" | "future";
  allowedRuntimeToday: false;
  validates: string;
  safeInputFields: readonly string[];
  forbiddenRawOrSensitiveFields: readonly string[];
  redactionBehavior: readonly string[];
  normalizationExpectation: string;
  failureBehavior: string;
  auditLoggingConstraints: string;
  monitoringConstraints: string;
};

const commonRouteGates = [
  "tests/platform-api-schema-routes.test.ts",
  "future public API/integration release gate required before activation"
] as const;

const forbiddenApiRouteFields = Array.from(
  new Set([
    ...PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
    "authorization_header",
    "cookie",
    "session_token",
    "raw_request_body",
    "raw_response_body"
  ])
).sort();

function routeContract(
  input: Omit<
    PlatformApiRouteContract,
    "allowedRuntimeToday" | "forbiddenRequestLogAuditFields" | "requiredTestsOrReleaseGates"
  >
): PlatformApiRouteContract {
  return {
    ...input,
    allowedRuntimeToday: false,
    forbiddenRequestLogAuditFields: forbiddenApiRouteFields,
    requiredTestsOrReleaseGates: commonRouteGates
  };
}

export const PLATFORM_API_ROUTE_CONTRACTS: Record<
  PlatformApiRouteId,
  PlatformApiRouteContract
> = {
  list_contracts: routeContract({
    id: "list_contracts",
    method: "GET",
    path: "/api/v1/contracts",
    status: "deferred",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["contracts:read"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    validationContractId: "contract_list_query",
    rateLimitPolicy: "per-organization and per-token read limit with burst controls",
    idempotencyExpectation: "read-only; cursor requests are replay-safe",
    paginationExpectation: "required cursor pagination with bounded page size and stable ordering",
    auditEventExpectation: "sensitive list access audited by organization, token fingerprint, scopes, and row count",
    monitoringEventExpectation: "platform_api_contracts_listed",
    requiredSecurityControls: ["organization-scoped token", "scope check", "tenant-scoped query", "bounded pagination"]
  }),
  read_contract: routeContract({
    id: "read_contract",
    method: "GET",
    path: "/api/v1/contracts/:id",
    status: "deferred",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["contracts:read"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    validationContractId: "contract_read_query",
    rateLimitPolicy: "per-organization, per-token, and per-contract read limits",
    idempotencyExpectation: "read-only; repeated reads must not mutate last-used except token usage metadata",
    auditEventExpectation: "contract API read audited with contract id, organization id, token fingerprint, and scopes",
    monitoringEventExpectation: "platform_api_contract_read",
    requiredSecurityControls: ["organization-scoped token", "scope check", "contract ownership check"]
  }),
  create_export: routeContract({
    id: "create_export",
    method: "POST",
    path: "/api/v1/exports",
    status: "future",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["exports:write"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["scoped_api_tokens", "data_warehouse_export", "audit_export_api_access"],
    validationContractId: "export_job_create",
    rateLimitPolicy: "strict per-org export job limit plus artifact and row-count preflight",
    idempotencyExpectation: "required idempotency key for every export job request",
    auditEventExpectation: "export job API request audited with preset, format, row count, token fingerprint, and sensitivity",
    monitoringEventExpectation: "platform_api_export_requested",
    requiredSecurityControls: ["export preset gate", "sensitive-section gate", "idempotency key", "scale preflight"]
  }),
  read_export: routeContract({
    id: "read_export",
    method: "GET",
    path: "/api/v1/exports/:id",
    status: "future",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["exports:read"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens", "data_warehouse_export", "audit_export_api_access"],
    validationContractId: "export_job_read",
    rateLimitPolicy: "per-org and per-token export status/download limits",
    idempotencyExpectation: "read-only; download events are replay-safe and audited",
    auditEventExpectation: "export artifact access audited by export id, preset, token fingerprint, and organization",
    monitoringEventExpectation: "platform_api_export_read",
    requiredSecurityControls: ["organization-scoped export id", "artifact expiry check", "sensitive-section access check"]
  }),
  list_audit_events: routeContract({
    id: "list_audit_events",
    method: "GET",
    path: "/api/v1/audit-events",
    status: "future",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["audit:read", "admin:read"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["audit_export_api_access", "scoped_api_tokens"],
    validationContractId: "audit_event_list_query",
    rateLimitPolicy: "strict admin read limit with bounded pagination and date windows",
    idempotencyExpectation: "read-only; cursor reads are replay-safe",
    paginationExpectation: "required cursor pagination and maximum date window",
    auditEventExpectation: "audit API access audited without raw audit JSON or internal diagnostics",
    monitoringEventExpectation: "platform_api_audit_events_listed",
    requiredSecurityControls: ["admin scope check", "redacted audit summaries only", "bounded pagination"]
  }),
  create_webhook_endpoint: routeContract({
    id: "create_webhook_endpoint",
    method: "POST",
    path: "/api/v1/webhooks/endpoints",
    status: "deferred",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["webhooks:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["outbound_webhooks"],
    validationContractId: "webhook_endpoint_create",
    rateLimitPolicy: "strict per-org endpoint mutation limit",
    idempotencyExpectation: "required idempotency key per endpoint URL fingerprint",
    auditEventExpectation: "webhook endpoint creation audited with URL origin/fingerprint and event types",
    monitoringEventExpectation: "platform_api_webhook_endpoint_created",
    requiredSecurityControls: ["signing secret generation", "endpoint verification", "replay protection", "safe event allowlist"]
  }),
  update_webhook_endpoint: routeContract({
    id: "update_webhook_endpoint",
    method: "PATCH",
    path: "/api/v1/webhooks/endpoints/:id",
    status: "deferred",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["webhooks:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["outbound_webhooks"],
    validationContractId: "webhook_endpoint_update",
    rateLimitPolicy: "strict per-org endpoint mutation limit",
    idempotencyExpectation: "required idempotency key per endpoint update",
    auditEventExpectation: "webhook endpoint update audited with changed safe fields only",
    monitoringEventExpectation: "platform_api_webhook_endpoint_updated",
    requiredSecurityControls: [
      "signing secret rotation support",
      "endpoint status gate",
      "safe event allowlist",
      "replay protection"
    ]
  }),
  delete_webhook_endpoint: routeContract({
    id: "delete_webhook_endpoint",
    method: "DELETE",
    path: "/api/v1/webhooks/endpoints/:id",
    status: "deferred",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["webhooks:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["outbound_webhooks"],
    validationContractId: "webhook_endpoint_delete",
    rateLimitPolicy: "strict per-org endpoint mutation limit",
    idempotencyExpectation: "DELETE uses idempotency semantics and disables before deletion",
    auditEventExpectation: "webhook endpoint deletion audited with endpoint fingerprint and actor/token",
    monitoringEventExpectation: "platform_api_webhook_endpoint_deleted",
    requiredSecurityControls: [
      "disable deliveries",
      "revoke signing secret",
      "preserve audit evidence",
      "replay protection"
    ]
  }),
  create_api_token: routeContract({
    id: "create_api_token",
    method: "POST",
    path: "/api/v1/api-tokens",
    status: "deferred",
    requiredAuthModel: "future_enterprise_admin_session",
    requiredScopes: ["admin:write"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    validationContractId: "api_token_create",
    rateLimitPolicy: "strict per-org and per-actor token mutation limit",
    idempotencyExpectation: "required idempotency key; raw token displayed once only",
    auditEventExpectation: "token creation audited with prefix/fingerprint/scopes only",
    monitoringEventExpectation: "platform_api_token_created",
    requiredSecurityControls: ["enterprise admin session", "scoped token generation", "one-time secret display", "raw token logging ban"]
  }),
  rotate_api_token: routeContract({
    id: "rotate_api_token",
    method: "POST",
    path: "/api/v1/api-tokens/:id/rotate",
    status: "deferred",
    requiredAuthModel: "future_enterprise_admin_session",
    requiredScopes: ["admin:write"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    validationContractId: "api_token_rotate",
    rateLimitPolicy: "strict per-token rotation limit",
    idempotencyExpectation: "required idempotency key; old token revoked after successful replacement",
    auditEventExpectation: "token rotation audited with old/new fingerprints only",
    monitoringEventExpectation: "platform_api_token_rotated",
    requiredSecurityControls: ["enterprise admin session", "old token revocation", "one-time secret display"]
  }),
  revoke_api_token: routeContract({
    id: "revoke_api_token",
    method: "POST",
    path: "/api/v1/api-tokens/:id/revoke",
    status: "deferred",
    requiredAuthModel: "future_enterprise_admin_session",
    requiredScopes: ["admin:write"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens"],
    validationContractId: "api_token_revoke",
    rateLimitPolicy: "strict per-token revocation limit",
    idempotencyExpectation: "revocation is idempotent by token id and request id",
    auditEventExpectation: "token revocation audited with token fingerprint and reason code",
    monitoringEventExpectation: "platform_api_token_revoked",
    requiredSecurityControls: ["enterprise admin session", "revocation status write", "preserve event evidence"]
  }),
  list_integrations: routeContract({
    id: "list_integrations",
    method: "GET",
    path: "/api/v1/integrations",
    status: "future",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["integrations:manage", "admin:read"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: [
      "oauth_app_connections",
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations"
    ],
    validationContractId: "integration_sync_request",
    rateLimitPolicy: "per-org integration management read limit",
    idempotencyExpectation: "read-only; no idempotency key required",
    paginationExpectation: "bounded provider list and connection status response",
    auditEventExpectation: "integration configuration read audited for sensitive admin contexts",
    monitoringEventExpectation: "platform_api_integrations_listed",
    requiredSecurityControls: ["admin scope check", "provider status only", "no OAuth token exposure"]
  }),
  oauth_callback: routeContract({
    id: "oauth_callback",
    method: "POST",
    path: "/api/v1/integrations/oauth/callback",
    status: "future",
    requiredAuthModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["oauth_app_connections"],
    validationContractId: "oauth_callback",
    rateLimitPolicy: "provider-specific callback limit plus state nonce replay controls",
    idempotencyExpectation: "state nonce and provider authorization code are single-use",
    auditEventExpectation: "OAuth connection callback audited with provider, scopes, and state result only",
    monitoringEventExpectation: "platform_api_oauth_callback_received",
    requiredSecurityControls: ["state verification", "provider-specific scopes", "replay protection", "secret storage reference"]
  }),
  trigger_integration_sync: routeContract({
    id: "trigger_integration_sync",
    method: "POST",
    path: "/api/v1/integrations/:provider/sync",
    status: "future",
    requiredAuthModel: "future_scoped_api_token",
    requiredScopes: ["integrations:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: [
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations",
      "data_warehouse_export"
    ],
    validationContractId: "integration_sync_request",
    rateLimitPolicy: "strict per-provider and per-organization sync job limit",
    idempotencyExpectation: "required idempotency key per provider/sync type",
    auditEventExpectation: "integration sync request audited with provider, job type, and actor/token",
    monitoringEventExpectation: "platform_api_integration_sync_requested",
    requiredSecurityControls: ["provider capability gate", "sync job limit", "review/trust gate preservation"]
  }),
  provider_webhook_callback: routeContract({
    id: "provider_webhook_callback",
    method: "POST",
    path: "/api/v1/integrations/:provider/webhooks",
    status: "future",
    requiredAuthModel: "future_provider_signed_webhook",
    requiredScopes: ["integrations:manage", "webhooks:manage"],
    requiredRoleOrCapability: "future_integration_settings",
    owningCapabilities: ["inbound_webhooks", "oauth_app_connections", "crm_procurement_accounting_integrations"],
    validationContractId: "provider_webhook_payload",
    rateLimitPolicy: "provider-specific body, signature-failure, and event-rate limits",
    idempotencyExpectation: "provider event id or idempotency key required for replay-safe processing",
    auditEventExpectation: "accepted/rejected provider event audited with provider event hash and reason code only",
    monitoringEventExpectation: "platform_api_provider_webhook_received",
    requiredSecurityControls: ["provider signature verification", "replay protection", "idempotency ledger", "bounded body parsing"]
  })
} as const;

export const PLATFORM_API_ROUTE_IDS = Object.keys(
  PLATFORM_API_ROUTE_CONTRACTS
) as PlatformApiRouteId[];

function validationContract(input: PlatformApiValidationContract): PlatformApiValidationContract {
  return input;
}

export const PLATFORM_API_VALIDATION_CONTRACTS: Record<
  PlatformApiValidationContractId,
  PlatformApiValidationContract
> = {
  api_token_create: validationContract({
    id: "api_token_create",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "API token label, scopes, expiration, and actor authority.",
    safeInputFields: ["label", "scope_ids", "expires_at", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["show raw token once only", "store prefix and fingerprint only"],
    normalizationExpectation: "Normalize scopes against FUTURE_API_SCOPES and reject unscoped tokens.",
    failureBehavior: "Return safe validation code without generating token material.",
    auditLoggingConstraints: "Audit token prefix, fingerprint, scopes, actor, org, and reason code only.",
    monitoringConstraints: "Monitor creation failures without token material."
  }),
  api_token_rotate: validationContract({
    id: "api_token_rotate",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Existing token identity, rotation reason, and actor authority.",
    safeInputFields: ["token_id", "reason_code", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["never log old or new token values", "store fingerprints only"],
    normalizationExpectation: "Normalize token id to organization-scoped token row and revoke old token after success.",
    failureBehavior: "Fail closed without issuing replacement token.",
    auditLoggingConstraints: "Audit old/new token fingerprints and reason code only.",
    monitoringConstraints: "Monitor rotation failures by code and token fingerprint."
  }),
  api_token_revoke: validationContract({
    id: "api_token_revoke",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Token revocation request and organization ownership.",
    safeInputFields: ["token_id", "reason_code", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["never require or log raw token value"],
    normalizationExpectation: "Normalize to organization-scoped token row and idempotent revoked status.",
    failureBehavior: "Fail closed if token ownership cannot be proven.",
    auditLoggingConstraints: "Audit token fingerprint, actor, and reason code only.",
    monitoringConstraints: "Monitor suspicious revoke attempts by stable reason code."
  }),
  contract_list_query: validationContract({
    id: "contract_list_query",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Contract list filters, pagination cursor, due window, and field projection.",
    safeInputFields: ["cursor", "limit", "updated_after", "due_window", "status", "fields"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["exclude raw contract text, OCR output, full notes, and evidence payloads"],
    normalizationExpectation: "Clamp limit, normalize date filters, and force organization-scoped query.",
    failureBehavior: "Return safe validation error before reading contract payloads.",
    auditLoggingConstraints: "Audit row count and field set only.",
    monitoringConstraints: "Monitor denied or over-limit reads without customer content."
  }),
  contract_read_query: validationContract({
    id: "contract_read_query",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Contract id and allowed API field projection.",
    safeInputFields: ["contract_id", "fields"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["exclude raw contract text, OCR output, full notes, and evidence payloads"],
    normalizationExpectation: "Resolve contract id only inside the token organization scope.",
    failureBehavior: "Return not-found/denied without cross-tenant existence leakage.",
    auditLoggingConstraints: "Audit contract id and field set only.",
    monitoringConstraints: "Monitor repeated denied reads by token fingerprint."
  }),
  export_job_create: validationContract({
    id: "export_job_create",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Export preset, format, filters, and sensitive-section authorization.",
    safeInputFields: ["preset", "format", "filters", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["store preset/format/row-count evidence, not row content"],
    normalizationExpectation: "Normalize preset through export policy and enforce scale preflight.",
    failureBehavior: "Deny before assembling export payload when entitlement or scale fails.",
    auditLoggingConstraints: "Audit preset, format, row count, sensitive sections, token fingerprint, and org.",
    monitoringConstraints: "Monitor export failures with stable failure codes only."
  }),
  export_job_read: validationContract({
    id: "export_job_read",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Export job id and artifact access state.",
    safeInputFields: ["export_request_id", "request_id"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["do not expose storage paths or raw artifact internals"],
    normalizationExpectation: "Resolve export request only in organization scope and enforce artifact expiry.",
    failureBehavior: "Return safe denied/not-found response without storage path leakage.",
    auditLoggingConstraints: "Audit export id, preset, format, and actor/token only.",
    monitoringConstraints: "Monitor missing/expired artifacts with safe codes."
  }),
  audit_event_list_query: validationContract({
    id: "audit_event_list_query",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Audit event filters, date window, and pagination cursor.",
    safeInputFields: ["cursor", "limit", "date_from", "date_to", "action", "actor_user_id"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["return structured audit summaries, not raw JSON/debug payloads"],
    normalizationExpectation: "Clamp date windows and page size, and enforce admin/audit scopes.",
    failureBehavior: "Deny before audit rows are read when scope is missing.",
    auditLoggingConstraints: "Audit audit-log access with filter summary and row count.",
    monitoringConstraints: "Monitor sensitive audit reads and denial spikes."
  }),
  webhook_endpoint_create: validationContract({
    id: "webhook_endpoint_create",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Webhook endpoint URL, event allowlist, signing policy, and actor authority.",
    safeInputFields: ["endpoint_url_origin", "event_type_ids", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["fingerprint endpoint URL and store signing secret reference only"],
    normalizationExpectation: "Normalize URL origin, event allowlist, and endpoint fingerprint.",
    failureBehavior: "Deny before signing secret generation when validation fails.",
    auditLoggingConstraints: "Audit endpoint origin/fingerprint and event allowlist only.",
    monitoringConstraints: "Monitor endpoint validation failures without URL secrets."
  }),
  webhook_endpoint_update: validationContract({
    id: "webhook_endpoint_update",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Webhook endpoint status, event allowlist, and optional signing secret rotation.",
    safeInputFields: ["endpoint_id", "endpoint_status", "event_type_ids", "rotate_secret", "request_id"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["redact signing secret material and endpoint URL path/query"],
    normalizationExpectation: "Resolve endpoint in organization scope and normalize changed safe fields.",
    failureBehavior: "Fail closed and preserve previous endpoint state.",
    auditLoggingConstraints: "Audit changed safe fields, endpoint fingerprint, and actor/token.",
    monitoringConstraints: "Monitor failed endpoint updates by stable code."
  }),
  webhook_endpoint_delete: validationContract({
    id: "webhook_endpoint_delete",
    status: "deferred",
    allowedRuntimeToday: false,
    validates: "Webhook endpoint deletion or disable request.",
    safeInputFields: ["endpoint_id", "reason_code", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["do not log signing secret or full endpoint URL"],
    normalizationExpectation: "Disable endpoint and halt delivery before deletion.",
    failureBehavior: "Fail closed if endpoint ownership cannot be proven.",
    auditLoggingConstraints: "Audit endpoint fingerprint, actor/token, and reason code.",
    monitoringConstraints: "Monitor deletion failures without endpoint secret material."
  }),
  oauth_callback: validationContract({
    id: "oauth_callback",
    status: "future",
    allowedRuntimeToday: false,
    validates: "OAuth callback state, provider, code presence, and provider-specific scopes.",
    safeInputFields: ["provider", "state_nonce_hash", "requested_scope_ids", "granted_scope_ids"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["exchange authorization code without logging it", "store token references only"],
    normalizationExpectation: "Verify state nonce, provider, redirect binding, and granted scopes before connection activation.",
    failureBehavior: "Fail closed on invalid state or replay before token exchange.",
    auditLoggingConstraints: "Audit provider, scopes, state result, and connection status only.",
    monitoringConstraints: "Monitor callback failures by provider and reason code only."
  }),
  integration_sync_request: validationContract({
    id: "integration_sync_request",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Provider, sync type, connection status, and idempotency key.",
    safeInputFields: ["provider", "sync_type", "connection_id", "request_id", "idempotency_key"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["do not log provider payloads or customer content"],
    normalizationExpectation: "Resolve provider capability and connection in organization scope.",
    failureBehavior: "Deny before enqueueing sync job if provider is not enabled.",
    auditLoggingConstraints: "Audit provider, sync type, job id, and actor/token only.",
    monitoringConstraints: "Monitor sync failures with failure codes and job ids."
  }),
  provider_webhook_payload: validationContract({
    id: "provider_webhook_payload",
    status: "future",
    allowedRuntimeToday: false,
    validates: "Provider webhook signature, event id, replay state, and bounded body shape.",
    safeInputFields: ["provider", "provider_event_id_hash", "event_type", "idempotency_key", "request_id"],
    forbiddenRawOrSensitiveFields: forbiddenApiRouteFields,
    redactionBehavior: ["discard raw provider payload after normalized event ledger entry"],
    normalizationExpectation: "Verify signature, enforce replay ledger, and normalize event type/failure code.",
    failureBehavior: "Return safe provider-compatible failure without leaking internals.",
    auditLoggingConstraints: "Audit provider event hash, verification result, and reason code only.",
    monitoringConstraints: "Monitor signature failure and replay spikes without payloads."
  })
} as const;

export const PLATFORM_API_VALIDATION_CONTRACT_IDS = Object.keys(
  PLATFORM_API_VALIDATION_CONTRACTS
) as PlatformApiValidationContractId[];

export function getPlatformApiRouteContract(routeId: PlatformApiRouteId) {
  return PLATFORM_API_ROUTE_CONTRACTS[routeId];
}
