# API Integration Schema And Route Contracts

Canonical code sources: `lib/product/platform-api-schema.ts` and `lib/product/platform-api-routes.ts`.

This is a future Enterprise contract. NoticeControl does not currently ship public API keys, scoped API tokens, customer webhook endpoints, OAuth app connections, Slack/Teams integrations, ERP/CRM/accounting sync, data warehouse export, or public `/api/v1` routes.

The purpose of this document is to make future API and integration implementation work explicit before any runtime route, database migration, or customer setting is enabled.

## Future Schema Model

Every future record is organization-scoped, lifecycle/status-aware, timestamped, indexed, auditable, monitorable, and forbidden from storing raw tokens or customer-sensitive payloads in safe metadata.

| Table | Status | Lifecycle/status field | Primary ownership | Key safety rule |
| --- | --- | --- | --- | --- |
| `api_tokens` | deferred | `token_status` | public API keys, scoped API tokens | Raw token values are shown once, hashed before storage, and never logged; prefix/fingerprint only. |
| `api_token_events` | deferred | `event_type` | public API keys, scoped API tokens | Token lifecycle and denied-use evidence stores token fingerprints, not authorization headers. |
| `oauth_connections` | future | `connection_status` | OAuth app connections and provider integrations | OAuth access/refresh tokens and client secrets live in encrypted secret storage; table rows hold references and scopes only. |
| `integration_connections` | future | `integration_status` | Slack, Teams, calendar, CRM/procurement/accounting, data warehouse | Provider credentials are referenced indirectly; integrations may not mutate contract truth outside review/trust gates. |
| `customer_webhook_endpoints` | deferred | `endpoint_status` | outbound customer webhooks | Signing secrets are secret references; endpoint URLs are origin/fingerprint-normalized for support views. |
| `customer_webhook_deliveries` | deferred | `delivery_status` | outbound customer webhooks | Delivery rows store event IDs, schemas, status, retry metadata, and failure codes only. |
| `integration_event_ledger` | future | `event_status` | inbound webhooks and provider events | Provider payloads are normalized into event hashes, type, status, and failure codes; raw payload retention is forbidden. |
| `integration_sync_jobs` | future | `job_status` | provider sync and data warehouse jobs | Sync job evidence must not include provider payloads or exported customer content. |

Schema-wide forbidden fields include raw API tokens, API key secrets, internal route secrets, cron secrets, destructive operation secrets, billing webhook secrets, monitoring webhook secrets, webhook signing secrets, OAuth client secrets, OAuth access/refresh/id tokens, authorization codes, provider payloads, raw webhook payloads, raw contract text, OCR output, raw extracted evidence, full note text, storage paths, uploaded document contents, payment provider payloads, debug traces, passwords, secrets, and tokens.

## Future Route Contract Table

The route registry defines future `/api/v1` shape without creating live Next.js routes.

| Route | Status | Auth model | Required scopes | Key controls |
| --- | --- | --- | --- | --- |
| `GET /api/v1/contracts` | deferred | scoped API token | `contracts:read` | Tenant-scoped query, bounded cursor pagination, field projection. |
| `GET /api/v1/contracts/:id` | deferred | scoped API token | `contracts:read` | Tenant-scoped contract ownership check and no cross-tenant existence leakage. |
| `POST /api/v1/exports` | future | scoped API token | `exports:write` | Export preset gates, scale preflight, idempotency key. |
| `GET /api/v1/exports/:id` | future | scoped API token | `exports:read` | Organization-scoped export ID, artifact expiry, sensitive-section access check. |
| `GET /api/v1/audit-events` | future | scoped API token | `audit:read`, `admin:read` | Redacted audit summaries only, bounded date windows, cursor pagination. |
| `POST /api/v1/webhooks/endpoints` | deferred | scoped API token | `webhooks:manage` | Signing secret generation, endpoint verification, replay protection, idempotency. |
| `PATCH /api/v1/webhooks/endpoints/:id` | deferred | scoped API token | `webhooks:manage` | Signing secret rotation, endpoint status gate, replay protection, idempotency. |
| `DELETE /api/v1/webhooks/endpoints/:id` | deferred | scoped API token | `webhooks:manage` | Disable deliveries, revoke signing secret, replay protection, idempotency. |
| `POST /api/v1/api-tokens` | deferred | future enterprise admin session | `admin:write` | One-time secret display, scoped token generation, raw-token logging ban. |
| `POST /api/v1/api-tokens/:id/rotate` | deferred | future enterprise admin session | `admin:write` | Old token revocation and one-time replacement token display. |
| `POST /api/v1/api-tokens/:id/revoke` | deferred | future enterprise admin session | `admin:write` | Idempotent revoke status and event evidence. |
| `GET /api/v1/integrations` | future | scoped API token | `integrations:manage`, `admin:read` | Provider status only; no OAuth token exposure. |
| `POST /api/v1/integrations/oauth/callback` | future | OAuth connection | `integrations:manage` | State verification, provider-specific scopes, replay protection, secret references. |
| `POST /api/v1/integrations/:provider/sync` | future | scoped API token | `integrations:manage` | Provider capability gate, sync job limits, review/trust gate preservation. |
| `POST /api/v1/integrations/:provider/webhooks` | future | provider-signed webhook | `integrations:manage`, `webhooks:manage` | Provider signature verification, replay protection, idempotency ledger, bounded body parsing. |

Every route is `allowedRuntimeToday: false`.

## Validation Boundaries

Validation contracts exist for:

- `api_token_create`
- `api_token_rotate`
- `api_token_revoke`
- `contract_list_query`
- `contract_read_query`
- `export_job_create`
- `export_job_read`
- `audit_event_list_query`
- `webhook_endpoint_create`
- `webhook_endpoint_update`
- `webhook_endpoint_delete`
- `oauth_callback`
- `integration_sync_request`
- `provider_webhook_payload`

Validation requirements:

- Token create/rotate/revoke must never require or log raw existing token values.
- Contract list/read validation must deny before payload reads when scope or tenant ownership fails.
- Export validation must apply export preset privacy gates and scale preflight before payload assembly.
- Audit-event validation must return structured redacted audit summaries, not raw audit JSON or internal diagnostics.
- Webhook endpoint validation must normalize endpoint origins/fingerprints, generate signing secret references, require replay protection, and preserve idempotency.
- OAuth callback validation must verify state nonce and provider-specific scopes before token exchange.
- Provider webhook validation must verify signatures, enforce replay/idempotency, bound body parsing, and normalize payloads into safe event ledger fields.

## Token Lifecycle

Future public API tokens must support creation, one-time display, scope assignment, expiration, rotation, revocation, last-used metadata, token fingerprints, audit events, and monitoring events.

Internal route secrets, cron secrets, destructive-operation secrets, billing webhook secrets, and monitoring webhook secrets are not customer API credentials and must never be reused as public API tokens.

## OAuth Lifecycle

Future OAuth connections must support state nonce verification, provider-specific scopes, token exchange into encrypted secret storage, refresh/revocation, disconnect, audit events, and provider-outage monitoring.

OAuth must remain provider-specific. A generic OAuth callback is not enough to ship Slack, Teams, calendar, CRM, procurement, accounting, or data warehouse integration behavior.

## Webhook Lifecycle

Future customer webhooks must support endpoint verification, signing secret generation/rotation, replay protection, idempotency keys, delivery queues, retry limits, endpoint disablement, audit events, and monitoring events.

Current Paddle billing webhooks, monitoring alert webhooks, cron routes, and internal routes are not a general customer webhook platform.

## Promotion Requirements

Before any API or integration contract becomes live:

- A real migration/RLS design must enforce organization scope.
- Token, OAuth, and webhook secrets must use encrypted secret storage.
- Route handlers must use the shared route-handler/auth/error/logging pattern.
- API scopes must map to exact product actions and entitlement gates.
- Rate limits and idempotency must be enforced at runtime.
- Audit and monitoring events must contain safe metadata only.
- Export, audit, contract, and intelligence APIs must preserve existing privacy and tenant-isolation gates.
- Customer docs and pricing copy must describe the exact shipped capability without implying broad integrations or full CLM.
