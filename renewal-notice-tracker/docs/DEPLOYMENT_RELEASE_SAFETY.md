# Deployment And Release Safety

Canonical checks: `npm run release:check`, `scripts/release-readiness-check.mjs`, and `scripts/deployment-readiness-gates.mjs`.

NoticeControl release safety is intentionally pragmatic: static repo checks, production-safe configuration validation, migration naming/coverage checks, background job readiness checks, monitoring/runbook coverage, and shipped-vs-future product truth gates. It does not require live Supabase CLI access or external provider calls.

## Required Production Configuration

Production deployments must provide reviewed values for:

- Supabase URL, anon key, service-role key, contract storage bucket, and export artifact bucket.
- App URL/domain settings using HTTPS and non-local hosts.
- Internal route secrets for health, OCR jobs, operational mutation routes, cron routes, and destructive operations.
- Destructive operation signing secret.
- Email provider key, sender, webhook signing secret, and email action secret.
- Paddle production API key, webhook secret, and price IDs when paid plans are enabled.
- OCR provider key/model when `OCR_PROVIDER=openai`.
- Monitoring sink settings and alert webhook signing secret when webhook fanout is enabled.
- Background export page size/job limit, reminder lease minutes, and OCR lease minutes.

Development and test environments may use local URLs and placeholders. Production must reject local URLs, placeholder/test secrets, sandbox Paddle settings, and unsigned alert webhooks.

Validation errors must mention variable names and safe error codes only. They must not print secret values.

## Release Readiness Command

Run:

```bash
npm run release:check
```

The command verifies:

- Phase-1 release metadata and two-week operator autonomy gates.
- Production-safe configuration when the target environment is production.
- Required package scripts exist.
- Release-critical, scope-freeze, monitoring, privacy, scale, background export, and ops readiness test scripts exist.
- Required shipped/future boundary docs exist.
- Operational runbooks exist.
- Metrics, alert rules, monitoring, logging, and operational logging contracts exist.
- Supabase migrations are named with `YYYYMMDDNNNN_slug.sql`, have unique timestamps, and cover shipped critical features.
- Supabase migrations are non-empty and remain in timestamp order.
- Background job config is bounded.
- Monitoring readiness includes metric-contract and alert-rule tests.
- Alert rules reference documented runbook IDs.
- Future-only modules are not accidentally marked shipped.

## Migration Safety

Migration checks are static. They enforce:

- `supabase/migrations` exists.
- Migration filenames use `YYYYMMDDNNNN_slug.sql`.
- Migration files are not empty.
- Migration timestamps stay ordered.
- Migration timestamps are unique.
- Shipped critical areas have migration coverage, including billing, security hardening, privacy operations, OCR jobs, Phase-1 workflow, financial intelligence fields, and scale readiness indexes.

Future-only contracts such as provider-backed SSO/SCIM, broad public API integrations, and future enterprise retention settings do not require live migrations until they are promoted into runtime scope.

## Background Worker Readiness

Release readiness covers:

- `BACKGROUND_EXPORT_PAGE_SIZE` between 100 and 5000.
- `BACKGROUND_EXPORT_JOB_LIMIT` between 1 and 10.
- `REMINDER_PROCESSING_LEASE_MINUTES` between 1 and 120.
- `OCR_PROCESSING_LEASE_MINUTES` between 1 and 120.
- Internal worker route secrets.
- Monitoring/runbook coverage for stuck or failed exports, reminders, OCR, billing webhooks, and destructive operations.

These checks are designed to prevent unbounded export generation, stranded reminders/OCR jobs, and unauthenticated worker entry points.

## Monitoring And Alert Readiness

Structured logs remain the baseline sink. Optional alert webhooks are allowed only through the configured monitoring sink and must be sanitized before delivery. Production webhook fanout must use HTTPS and a signing secret.

Alert rules as code must reference `Runbook ID: ...` entries in `docs/OPERATIONAL_RUNBOOKS.md`. A rule without a documented runbook is not production-ready, even if the metric exists.

Alert-worthy events and response guidance live in:

- [OPERATIONAL_EVENT_INVENTORY.md](OPERATIONAL_EVENT_INVENTORY.md)
- [OPERATIONAL_RUNBOOKS.md](OPERATIONAL_RUNBOOKS.md)
- [OPERATIONAL_MATURITY.md](OPERATIONAL_MATURITY.md)

Alerts must never include raw contract text, OCR output, full notes, provider payloads, storage paths, tokens, secrets, uploaded documents, payment payloads, or email bodies.

## Shipped Vs Future Discipline

Release checks protect the product truth that:

- Provider-backed SSO login is not shipped.
- Live SCIM provisioning endpoints are not shipped.
- Public customer API is not shipped.
- Slack/Teams and ERP/CRM integrations are not shipped.
- Approval routing, negotiation tracking, e-signature, and full CLM are not shipped.
- External monitoring backend contracts may exist, but a full alerting platform is not implied unless configured and released.

Any promotion from future/deferred to shipped must update the platform registry, docs, tests, release gates, migration coverage when runtime state is introduced, and support runbooks.

## Rollback And Incident Basics

Before production release, identify:

- smoke-check owner
- rollback owner
- target environment
- support/incident contact
- migration rollback or forward-fix plan
- monitoring owner for the release window

If release checks fail, do not bypass them by manually editing product truth docs or weakening config validation. Fix the underlying missing script, doc, migration, config, or runtime boundary.
