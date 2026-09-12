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
- Market expansion boundary docs, market profile policy contracts, and market activation approval contracts exist.
- Operational runbooks exist.
- Metrics, alert rules, monitoring, logging, and operational logging contracts exist.
- Supabase migrations are named with `YYYYMMDDNNNN_slug.sql`, have unique timestamps, and cover shipped critical features.
- Supabase migrations are non-empty and remain in timestamp order.
- Background job config is bounded.
- Monitoring readiness includes metric-contract and alert-rule tests.
- Alert rules reference documented runbook IDs.
- Future-only modules are not accidentally marked shipped.
- Planned/restricted market profiles remain policy-only and are covered by scope-freeze tests.

## Migration Safety

Migration checks are static. They enforce:

- `supabase/migrations` exists.
- Migration filenames use `YYYYMMDDNNNN_slug.sql`.
- Migration files are not empty.
- Migration timestamps stay ordered.
- Migration timestamps are unique.
- Shipped critical areas have migration coverage, including billing, security hardening, privacy operations, OCR jobs, Phase-1 workflow, financial intelligence fields, and scale readiness indexes.

Future-only contracts such as provider-backed SSO/SCIM, broad public API integrations, and future enterprise retention settings do not require live migrations until they are promoted into runtime scope.

## Migration Rollout Procedure

Published migrations are forward-only. Never delete, edit, or use rollback SQL against a shared or
production database. The target is explicit through `RELEASE_TARGET_ENV` (`staging` or `production`) and
`SUPABASE_DB_URL`; the URL is never printed.

1. Run `npm run db:migrations:plan` against staging. It first validates ordering and forward-only
   migration safety, then asks Supabase for the pending plan and prints a SHA-256 fingerprint of the
   exact local migration inventory.
2. Review the plan and record that fingerprint as `MIGRATION_PLAN_REVIEW_SHA256`. The release workflow
   requires this value and rejects it if the local migration inventory changes.
3. Deploy and verify staging application, PDF worker, reminder worker, scheduler, authenticated runtime
   readiness, and the required SaaS PDF journey. The migration plan is evidence; it does not apply a
   database change.
4. For an approved target apply, set `CONFIRM_DATABASE_MIGRATION_ROLLOUT` exactly to the target
   environment and run `npm run db:migrations:apply`. The command rechecks migration safety and the
   reviewed fingerprint before it can invoke Supabase.

Apply additive, backward-compatible migrations before rolling application and worker processes. Keep old
and new application versions compatible with the schema throughout the rollout. If migrations succeed but
the application deployment fails, do not attempt to reverse database history: restore a compatible
application version only when the additive schema supports it; otherwise ship and validate a forward fix.
No routine incident procedure may drop tables, columns, or customer data.

## Staging SaaS PDF Release Proof

The manual release workflow creates a deterministic synthetic SaaS PDF at runtime and sets
`E2E_CONTRACT_INTELLIGENCE_PDF_PATH` explicitly. It verifies authenticated runtime readiness before the
browser flow, plans and verifies the reviewed migration inventory, then runs `release:strict`. Required
SaaS PDF acceptance cannot silently skip when cookies, staging URL, or the fixture are unavailable.

The PDF fixture contains only fixed synthetic contract terms: a 2027-12-31 renewal, a 30-day notice
period, an annual EUR 12,000 value, and no customer data. The browser proof covers asynchronous intake,
persisted recovery, human review, explicit clock activation, one active clock row, ICS download, and
cross-organization denial. Retry, abandonment, cleanup, reminder trust gating, and deeper data-integrity
rules remain covered by the focused release-critical tests rather than duplicated through timing-sensitive
staging browser setup.

## Background Worker Readiness

Release readiness covers:

- `BACKGROUND_EXPORT_PAGE_SIZE` between 100 and 5000.
- `BACKGROUND_EXPORT_JOB_LIMIT` between 1 and 10.
- `REMINDER_PROCESSING_LEASE_MINUTES` between 1 and 120.
- `OCR_PROCESSING_LEASE_MINUTES` between 1 and 120.
- Internal worker route secrets.
- Monitoring/runbook coverage for stuck or failed exports, reminders, OCR, billing webhooks, and destructive operations.

These checks are designed to prevent unbounded export generation, stranded reminders/OCR jobs, and unauthenticated worker entry points.

## SaaS PDF Worker Rollout

This repository has no canonical hosting or process-manager manifest. Before enabling customer SaaS PDF intake, production must run `npm run worker:pdf` as a continuously supervised process alongside the web application.

- The web application stores the PDF and queues `contract_pdf_extraction`; it does not run parsing, OCR, or provider extraction inside the claim HTTP request.
- PDFs remain queued until the worker claims them. The worker needs the same application and database configuration used by the background-job runtime.
- Start and verify the worker before enabling customer PDF intake. If it is not deployed, that is an explicit rollout prerequisite rather than hidden application behavior.
- The worker has a bounded attempt watchdog; queue leases, retries, and dead-letter transitions remain the durable recovery mechanism.

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
