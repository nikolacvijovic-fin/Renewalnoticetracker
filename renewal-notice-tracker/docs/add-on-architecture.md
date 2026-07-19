# NoticeControl Add-on Architecture

NoticeControl remains a TypeScript/Next.js renewal-control product. Add-ons extend the platform only through explicit contracts, service boundaries, entitlements, and health checks.

This architecture is scaffolded. The Python, Go, and Java services are not production-ready providers yet.

## Core Rule

Do not move UI logic into Python, Go, or Java.

The TypeScript app continues to own:

- authentication and organization routing
- contract detail, onboarding, dashboard, and admin UI
- server actions and route handlers
- trusted reminder gate display
- trust exception approval UI
- billing and entitlement decisions

## Registry

The source of truth is `lib/add-ons/add-on-registry.ts`.

Registered add-ons:

| Add-on ID | Runtime | Status | Entitlement | Commercial value |
| --- | --- | --- | --- | --- |
| `python_contract_intelligence` | Python/FastAPI | scaffolded | `intelligence.contract_extraction` | Extraction, quote comparison, usage reconciliation, and deterministic risk scoring scaffolds |
| `go_reliability_worker` | Go | scaffolded | `reliability.reminder_worker` | Idempotent background processing for reminders, imports, webhooks, and audit events |
| `java_enterprise_connectors` | Java/Spring | scaffolded | `enterprise.connectors` | Optional large-customer connector boundary |
| `postgres_reporting_backbone` | SQL/Postgres | active | `core.reporting_backbone` | Tenant-scoped audit, import, reconciliation, readiness, and reporting structures |

Disabled, planned, or unhealthy add-ons must not execute.

## SQL/Postgres Backbone

Migration: `supabase/migrations/202607130003_add_on_commercial_backbone.sql`

The migration adds:

- audit ledgers: `contract_audit_events`, `trusted_reminder_gate_events`, `trust_exception_approval_events`, `renewal_decision_events`
- reporting views: `organization_renewal_readiness`, `contract_trusted_reminder_status`, `owner_accountability_summary`, `upcoming_notice_deadlines`, `spend_at_risk_summary`
- import staging: `contract_import_batches`, `contract_import_rows`, `contract_import_errors`
- usage reconciliation scaffolds: `usage_import_batches`, `usage_import_rows`, `contract_usage_matches`, `unmatched_usage_rows`, `duplicate_vendor_spend`, `license_waste_opportunities`

All new tables include `organization_id` and RLS. Audit event tables are readable by organization members but have no broad client insert policy; mutation should go through trusted server-side paths.

Commercial backbone tables are member-readable but restricted-write:

- audit/event rows are trusted server-path writes only
- import batch creation is limited to owner/admin/operator/reviewer roles
- import rows/errors are member-read and service-write
- usage reconciliation derived findings are member-read, with review updates limited to owner/admin/operator where applicable

## Python Intelligence

Path: `services/python-intelligence`

Purpose:

- contract extraction workflow contracts
- renewal quote comparison
- usage reconciliation
- risk scoring

Endpoints:

- `GET /health`
- `POST /extract-contract`
- `POST /compare-quote`
- `POST /reconcile-usage`
- `POST /score-risk`

Current implementation is deterministic scaffold logic. It does not call AI providers and must not claim production extraction quality.

## Go Worker

Path: `services/go-worker`

Purpose:

- reliable reminder delivery jobs
- import processing
- webhook dispatch normalization
- audit event processing
- idempotency and retry classification

The worker does not send production email/SMS/webhooks yet. Provider integrations must be added behind explicit interfaces and idempotency keys.

## Java Enterprise Connectors

Path: `services/java-enterprise-connectors`

Purpose:

- procurement connector interface
- identity connector interface
- approval workflow connector interface
- compliance export connector interface

Planned adapters remain future-only:

- Coupa
- SAP Ariba
- Oracle Procurement
- ServiceNow
- Workday
- NetSuite
- SCIM/SAML identity provisioning

## TypeScript Clients

Client files:

- `lib/add-ons/python-intelligence-client.ts`
- `lib/add-ons/go-worker-client.ts`
- `lib/add-ons/java-enterprise-client.ts`

Environment variables:

- `PYTHON_INTELLIGENCE_URL`
- `GO_WORKER_URL`
- `JAVA_ENTERPRISE_CONNECTORS_URL`

Clients must:

- return safe error objects
- include request correlation IDs
- use timeout handling
- sign protected requests with `ADD_ON_INTERNAL_SIGNING_SECRET`
- avoid throwing raw transport errors
- avoid logging raw provider payloads, contract text, OCR output, tokens, or secrets

Protected add-on calls include:

- `x-request-correlation-id`
- `x-noticecontrol-timestamp`
- `x-noticecontrol-body-sha256`
- `x-noticecontrol-signature`

The signature format is `sha256=<hex>`, using HMAC-SHA256 over:

```text
METHOD
/path?query
timestamp
bodySha256
```

`GET /health` may be unsigned for local scaffold checks. Mutating or data-bearing calls fail closed if the signing secret is missing.

## Operator Dashboard

Page: `app/admin/add-ons/page.tsx`

This is an internal operator page. It shows registered add-ons, status, runtime, entitlement, health, commercial value, and risk level.

It does not enable customer-facing modules.

## Deployment Notes

Local development may leave all add-on URLs empty. Empty URLs produce `not_configured` health results and must not break the core product.

Future production rollout requires:

- service deployment per runtime
- service-to-service auth
- request signing or mTLS where appropriate
- health monitoring
- tenant-scoped request validation
- idempotency for every mutating workflow
- audit events for customer-visible state changes

## Security Model

Never send or log:

- raw contract text
- full notes
- OCR output
- provider payloads
- payment secrets
- SAML assertions
- OIDC tokens
- SCIM bearer tokens
- storage paths
- uploaded document contents

Add-ons receive organization-scoped inputs and return bounded outputs. TypeScript remains the entitlement and user-facing workflow shell.

## What Is Production-ready Today

- TypeScript registry and safe client contracts
- operator visibility page
- SQL tenant-scoped backbone migration

## What Remains Scaffolded

- Python provider-backed extraction or AI workflows
- Go production queue processing
- Java enterprise adapters
- service-to-service auth
- external deployment and monitoring
- customer-facing add-on activation UI
