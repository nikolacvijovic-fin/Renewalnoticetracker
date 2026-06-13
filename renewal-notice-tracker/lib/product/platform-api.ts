export type PlatformApiCapabilityStatus = "shipped" | "deferred" | "future" | "excluded";

export type PlatformApiRuntimeSurfaceToday =
  | "none"
  | "internal_only"
  | "provider_specific_existing_webhook";

export type PlatformApiPlanGate =
  | "none"
  | "starter"
  | "growth"
  | "portfolio"
  | "enterprise_future"
  | "internal_only"
  | "excluded";

export type PlatformApiAuthenticationModel =
  | "future_org_scoped_api_key"
  | "future_scoped_api_token"
  | "future_oauth_connection"
  | "future_signed_customer_webhook"
  | "provider_specific_existing_webhook"
  | "none";

export const FUTURE_API_SCOPES = [
  "contracts:read",
  "contracts:write",
  "renewals:read",
  "renewals:write",
  "exports:read",
  "exports:write",
  "intelligence:read",
  "billing:read",
  "audit:read",
  "webhooks:manage",
  "integrations:manage",
  "admin:read",
  "admin:write"
] as const;

export type FutureApiScope = (typeof FUTURE_API_SCOPES)[number];

export type PlatformApiCapabilityId =
  | "public_api_keys"
  | "scoped_api_tokens"
  | "oauth_app_connections"
  | "outbound_webhooks"
  | "inbound_webhooks"
  | "slack_integration"
  | "teams_integration"
  | "calendar_integration"
  | "crm_procurement_accounting_integrations"
  | "data_warehouse_export"
  | "audit_export_api_access";

export type PlatformApiCapability = {
  id: PlatformApiCapabilityId;
  label: string;
  status: PlatformApiCapabilityStatus;
  allowedRuntimeSurfaceToday: PlatformApiRuntimeSurfaceToday;
  requiredPlanGate: PlatformApiPlanGate;
  authenticationModel: PlatformApiAuthenticationModel;
  requiredScopes: readonly FutureApiScope[];
  rateLimitExpectation: string;
  idempotencyExpectation: string;
  auditExpectation: string;
  monitoringExpectation: string;
  requiredTestsOrReleaseGates: readonly string[];
  forbiddenBehavior: readonly string[];
};

export type FutureApiScopeDefinition = {
  scope: FutureApiScope;
  status: "deferred" | "future";
  owningCapabilities: readonly PlatformApiCapabilityId[];
  description: string;
};

const commonApiTests = [
  "tests/platform-api-boundary.test.ts",
  "future public API/integration release gate required before activation"
] as const;

export const PLATFORM_API_CAPABILITIES: Record<
  PlatformApiCapabilityId,
  PlatformApiCapability
> = {
  public_api_keys: {
    id: "public_api_keys",
    label: "Public API keys",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_org_scoped_api_key",
    requiredScopes: ["contracts:read", "renewals:read", "exports:read"],
    rateLimitExpectation: "Per-organization and per-token rate limits must exist before any key is active.",
    idempotencyExpectation: "Write endpoints must require idempotency keys before API keys can mutate data.",
    auditExpectation: "Key creation, rotation, revocation, and privileged API use must be audited with token fingerprint only.",
    monitoringExpectation: "Auth failures, rate-limit spikes, and sensitive reads must emit safe operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not expose API key creation in current settings UI.",
      "Do not reuse internal route secrets as customer API tokens.",
      "Do not log raw API keys."
    ]
  },
  scoped_api_tokens: {
    id: "scoped_api_tokens",
    label: "Scoped API tokens",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_scoped_api_token",
    requiredScopes: [
      "contracts:read",
      "contracts:write",
      "renewals:read",
      "renewals:write",
      "exports:read",
      "exports:write",
      "intelligence:read",
      "billing:read",
      "audit:read",
      "admin:read",
      "admin:write"
    ],
    rateLimitExpectation: "Tokens require scope-aware per-organization and per-token throttles.",
    idempotencyExpectation: "Every write scope requires idempotency-key semantics and replay-safe persistence.",
    auditExpectation: "Token lifecycle and sensitive scope use must be audited with actor, org, scope, and fingerprint metadata.",
    monitoringExpectation: "Denied scope use, token abuse, and write failures must emit safe monitoring events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not infer API access from admin role alone.",
      "Do not allow unscoped tokens.",
      "Do not expose token secret material after creation."
    ]
  },
  oauth_app_connections: {
    id: "oauth_app_connections",
    label: "OAuth app connections",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage", "admin:read"],
    rateLimitExpectation: "Provider-specific quotas and app-level throttles must be modeled per connection.",
    idempotencyExpectation: "OAuth callback handling must be replay-safe and state-parameter verified.",
    auditExpectation: "Connection created, refreshed, revoked, and scope-changed events must be audited without tokens.",
    monitoringExpectation: "Provider auth failures and revocation drift must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not add live OAuth callbacks before provider-specific security review.",
      "Do not store raw access tokens in logs, audit, analytics, or support diagnostics."
    ]
  },
  outbound_webhooks: {
    id: "outbound_webhooks",
    label: "Outbound customer webhooks",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_signed_customer_webhook",
    requiredScopes: ["webhooks:manage"],
    rateLimitExpectation: "Webhook dispatch must use bounded queues and per-endpoint delivery limits.",
    idempotencyExpectation: "Every delivery must carry a stable event ID and retry idempotency key.",
    auditExpectation: "Webhook endpoint changes and delivery failures must be audited safely.",
    monitoringExpectation: "Delivery failure spikes, signing failures, and disabled endpoints must alert by severity.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not send raw contract text, OCR output, full notes, secrets, or provider payloads.",
      "Do not confuse customer webhooks with internal monitoring alert webhooks."
    ]
  },
  inbound_webhooks: {
    id: "inbound_webhooks",
    label: "Inbound customer/provider webhooks",
    status: "future",
    allowedRuntimeSurfaceToday: "provider_specific_existing_webhook",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "provider_specific_existing_webhook",
    requiredScopes: ["webhooks:manage", "integrations:manage"],
    rateLimitExpectation: "Inbound endpoints require provider-specific throttles before activation.",
    idempotencyExpectation: "Inbound payloads must use provider event IDs or request idempotency keys.",
    auditExpectation: "Accepted, rejected, replayed, and failed inbound events must be audited with safe metadata only.",
    monitoringExpectation: "Signature failures, replay spikes, and queue failures must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not treat Paddle billing webhooks as a general customer webhook platform.",
      "Do not accept unsigned or replayable inbound integration payloads."
    ]
  },
  slack_integration: {
    id: "slack_integration",
    label: "Slack integration",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage", "renewals:read"],
    rateLimitExpectation: "Slack delivery must honor Slack workspace/channel limits and app quotas.",
    idempotencyExpectation: "Reminder or notification delivery must dedupe by workflow event ID.",
    auditExpectation: "Connection, channel routing, and delivery policy changes must be audited.",
    monitoringExpectation: "Delivery failures and auth revocations must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: ["Do not ship Slack delivery in current customer runtime."]
  },
  teams_integration: {
    id: "teams_integration",
    label: "Microsoft Teams integration",
    status: "deferred",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage", "renewals:read"],
    rateLimitExpectation: "Teams delivery must honor tenant/channel limits and provider throttles.",
    idempotencyExpectation: "Reminder or notification delivery must dedupe by workflow event ID.",
    auditExpectation: "Connection, channel routing, and delivery policy changes must be audited.",
    monitoringExpectation: "Delivery failures and auth revocations must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: ["Do not ship Teams delivery in current customer runtime."]
  },
  calendar_integration: {
    id: "calendar_integration",
    label: "Calendar integration",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage", "renewals:read"],
    rateLimitExpectation: "Calendar sync requires provider-specific sync and retry limits.",
    idempotencyExpectation: "Calendar event writes must dedupe by contract cycle and provider event key.",
    auditExpectation: "Connection, sync, and disconnect events must be audited without OAuth tokens.",
    monitoringExpectation: "Sync drift and provider failures must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: ["Do not replace the shipped per-contract ICS export with live sync without a release gate."]
  },
  crm_procurement_accounting_integrations: {
    id: "crm_procurement_accounting_integrations",
    label: "CRM/procurement/accounting integrations",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_oauth_connection",
    requiredScopes: ["integrations:manage", "contracts:read", "billing:read"],
    rateLimitExpectation: "Each provider connector needs provider-specific quotas, field allowlists, and backoff.",
    idempotencyExpectation: "External upserts must use stable external IDs and replay-safe reconciliation.",
    auditExpectation: "Connection, field mapping, import/export, and failure events must be audited safely.",
    monitoringExpectation: "Sync drift, data-shape failures, and auth failures must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not add ERP, CRM, procurement-suite, or accounting sync in current runtime.",
      "Do not let external systems mutate contract truth without review and trust gates."
    ]
  },
  data_warehouse_export: {
    id: "data_warehouse_export",
    label: "Data warehouse export",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_scoped_api_token",
    requiredScopes: ["exports:read", "audit:read", "intelligence:read"],
    rateLimitExpectation: "Bulk export requires job limits, row limits, artifact limits, and per-org scheduling controls.",
    idempotencyExpectation: "Scheduled and manual exports must dedupe by export job ID and destination fingerprint.",
    auditExpectation: "Destination changes and export job lifecycle must be audited with safe metadata.",
    monitoringExpectation: "Large export failures, stuck jobs, and destination failures must alert by severity.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not bypass export preset privacy gates.",
      "Do not stream raw notes, OCR output, or evidence payloads by default."
    ]
  },
  audit_export_api_access: {
    id: "audit_export_api_access",
    label: "Audit/export API access",
    status: "future",
    allowedRuntimeSurfaceToday: "none",
    requiredPlanGate: "enterprise_future",
    authenticationModel: "future_scoped_api_token",
    requiredScopes: ["audit:read", "exports:read", "exports:write", "admin:read"],
    rateLimitExpectation: "Audit API access requires strict per-org limits and pagination.",
    idempotencyExpectation: "Audit export job creation must require idempotency keys.",
    auditExpectation: "Audit access must itself be audited without exposing redacted details.",
    monitoringExpectation: "Sensitive audit reads and denied access spikes must emit operational events.",
    requiredTestsOrReleaseGates: commonApiTests,
    forbiddenBehavior: [
      "Do not expose raw audit JSON or internal diagnostics to customer API consumers.",
      "Do not ship audit export API before redaction and admin controls are proven."
    ]
  }
} as const;

export const PLATFORM_API_CAPABILITY_IDS = Object.keys(
  PLATFORM_API_CAPABILITIES
) as PlatformApiCapabilityId[];

export const API_SCOPE_REGISTRY: Record<FutureApiScope, FutureApiScopeDefinition> = {
  "contracts:read": {
    scope: "contracts:read",
    status: "deferred",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens", "crm_procurement_accounting_integrations"],
    description: "Read reviewed contract register fields through a future organization-scoped API."
  },
  "contracts:write": {
    scope: "contracts:write",
    status: "future",
    owningCapabilities: ["scoped_api_tokens"],
    description: "Create or update contract records only through future review and trust gates."
  },
  "renewals:read": {
    scope: "renewals:read",
    status: "deferred",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens", "slack_integration", "teams_integration", "calendar_integration"],
    description: "Read renewal cycle, owner, reminder, and decision state."
  },
  "renewals:write": {
    scope: "renewals:write",
    status: "future",
    owningCapabilities: ["scoped_api_tokens"],
    description: "Write renewal workflow state only through future scoped, audited APIs."
  },
  "exports:read": {
    scope: "exports:read",
    status: "future",
    owningCapabilities: ["public_api_keys", "scoped_api_tokens", "data_warehouse_export", "audit_export_api_access"],
    description: "Read export job status and retrieve gated export artifacts."
  },
  "exports:write": {
    scope: "exports:write",
    status: "future",
    owningCapabilities: ["scoped_api_tokens", "audit_export_api_access"],
    description: "Create future export jobs using preset privacy and scale gates."
  },
  "intelligence:read": {
    scope: "intelligence:read",
    status: "future",
    owningCapabilities: ["scoped_api_tokens", "data_warehouse_export"],
    description: "Read confidence-gated intelligence outputs without mutating workflow truth."
  },
  "billing:read": {
    scope: "billing:read",
    status: "future",
    owningCapabilities: ["scoped_api_tokens", "crm_procurement_accounting_integrations"],
    description: "Read normalized billing/entitlement state without provider payloads."
  },
  "audit:read": {
    scope: "audit:read",
    status: "future",
    owningCapabilities: ["scoped_api_tokens", "data_warehouse_export", "audit_export_api_access"],
    description: "Read redacted audit summaries through future admin-gated APIs."
  },
  "webhooks:manage": {
    scope: "webhooks:manage",
    status: "future",
    owningCapabilities: ["outbound_webhooks", "inbound_webhooks"],
    description: "Manage future customer webhook endpoints, signing secrets, and delivery policy."
  },
  "integrations:manage": {
    scope: "integrations:manage",
    status: "future",
    owningCapabilities: [
      "oauth_app_connections",
      "inbound_webhooks",
      "slack_integration",
      "teams_integration",
      "calendar_integration",
      "crm_procurement_accounting_integrations"
    ],
    description: "Manage future provider connections and integration settings."
  },
  "admin:read": {
    scope: "admin:read",
    status: "future",
    owningCapabilities: ["scoped_api_tokens", "oauth_app_connections", "audit_export_api_access"],
    description: "Read future enterprise admin configuration safely."
  },
  "admin:write": {
    scope: "admin:write",
    status: "future",
    owningCapabilities: ["scoped_api_tokens"],
    description: "Mutate future enterprise admin configuration only through hardened admin gates."
  }
} as const;

export const PUBLIC_API_TOKEN_CONTRACT = {
  status: "deferred",
  organizationScoped: true,
  scopesRequired: true,
  lifecycle: ["created", "rotated", "revoked"] as const,
  rawTokenLoggingAllowed: false,
  safeLogIdentifiers: ["token_prefix", "token_fingerprint", "organization_id"] as const,
  forbiddenCredentialSources: [
    "internal_route_secrets",
    "cron_secrets",
    "destructive_operation_secrets",
    "billing_webhook_secrets",
    "monitoring_webhook_secrets"
  ] as const
} as const;

export const CUSTOMER_WEBHOOK_CONTRACT = {
  status: "deferred",
  signingRequired: true,
  replayProtectionRequired: true,
  idempotencyKeyRequired: true,
  retryPolicyRequired: true,
  safePayloadMetadataOnly: true,
  forbiddenPayloadFields: [
    "raw_contract_text",
    "full_note_text",
    "ocr_output",
    "raw_extracted_evidence",
    "provider_payload",
    "secrets",
    "tokens",
    "storage_paths"
  ] as const,
  currentProviderWebhooksAreGeneralPlatformWebhooks: false
} as const;
