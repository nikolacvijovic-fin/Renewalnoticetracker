# API And Integration Boundary

Canonical code sources: [../lib/product/platform-api.ts](../lib/product/platform-api.ts), [../lib/product/platform-api-schema.ts](../lib/product/platform-api-schema.ts), and [../lib/product/platform-api-routes.ts](../lib/product/platform-api-routes.ts).

NoticeControl does not currently ship a public customer API, API keys, scoped tokens, OAuth app connections, customer webhooks, Slack, Teams, ERP, CRM, accounting, procurement-suite sync, calendar sync, data warehouse export, or audit API access.

The current product remains the renewal-control kernel plus gated intelligence, exports, billing, and internal operations. API and integration expansion is deferred under the `enterprise_integrations` platform module and must not appear in customer navigation, settings UI, pricing copy, or route behavior until a future release gate promotes it.

## Future Capability Classes

Future or deferred capability classes are:

- public API keys
- scoped API tokens
- OAuth app connections
- outbound customer webhooks
- inbound customer/provider webhooks
- Slack integration
- Microsoft Teams integration
- calendar integration
- CRM/procurement/accounting integrations
- data warehouse export
- audit/export API access

Every capability must declare status, runtime surface, plan gate, authentication model, scopes, rate-limit expectations, idempotency expectations, audit expectations, monitoring expectations, release proof, and explicitly forbidden behavior in the registry.

Future implementation-ready schema, route, and validation contracts are documented in [enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md](enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md). They are not live runtime routes or migrations.

## Future Scopes

The future API scope list is intentionally typed before implementation:

- `contracts:read`
- `contracts:write`
- `renewals:read`
- `renewals:write`
- `exports:read`
- `exports:write`
- `intelligence:read`
- `billing:read`
- `audit:read`
- `webhooks:manage`
- `integrations:manage`
- `admin:read`
- `admin:write`

All scopes are deferred or future. No scope grants runtime access today.

## Authentication Boundary

Future API keys and scoped tokens must be organization-scoped, scope-bound, rotatable, revocable, and auditable. Raw token values must never be logged, audited, monitored, displayed after creation, or stored in support diagnostics.

Allowed safe identifiers are token prefixes, token fingerprints, organization IDs, actor user IDs, and request IDs.

Internal route secrets, cron secrets, destructive operation secrets, billing webhook secrets, and monitoring webhook secrets are not customer API credentials and must never be reused as public API tokens.

## Webhook Boundary

Future outbound customer webhooks require signing, replay protection, idempotency keys, bounded retry behavior, endpoint-level rate limits, safe payload schemas, audit records, and monitoring events.

Future inbound integration webhooks require provider-specific verification, replay protection, idempotency ledgers, safe failure responses, and support runbooks before activation.

Current Paddle billing webhooks, monitoring alert webhooks, internal routes, and cron routes are operational/provider-specific mechanisms. They are not a general customer webhook platform.

Webhook payloads must never include raw contract text, full notes, OCR output, raw extracted evidence, provider payloads, secrets, tokens, uploaded document contents, or storage paths.

## Promotion Criteria

Before any API or integration capability can ship:

- The registry status must change in `lib/product/platform-api.ts`.
- Schema contracts in `lib/product/platform-api-schema.ts` and route contracts in `lib/product/platform-api-routes.ts` must be promoted deliberately with migrations/routes/tests.
- The platform module registry must remain aligned.
- The capability must have a concrete entitlement or Enterprise packaging gate.
- Token lifecycle, OAuth lifecycle, or webhook lifecycle must be implemented and tested.
- Rate limits and idempotency must be enforced.
- Audit and monitoring events must be safe and documented.
- Tenant isolation, sensitive export, and intelligence access checks must be proven.
- Customer docs and support runbooks must describe the exact shipped scope and exclusions.
