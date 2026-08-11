# NoticeControl Scale And Performance Notes

This note captures current synchronous scale assumptions and the next operational thresholds.

## Current Synchronous Envelope

NoticeControl is optimized for vendor-side renewal-control workspaces with hundreds to low thousands of contracts. Current synchronous paths are acceptable when:
- contract list pages render scoped contract metadata only
- export requests stay below `5000` rows
- rich exports include bounded note previews and decision summaries
- intelligence dashboards calculate from already-scoped contract rows
- reminder/OCR jobs process bounded batches through internal routes

If a workspace regularly exceeds these limits, move heavy exports and recalculation jobs to background execution before expanding customer-facing scope.

## Export And Reporting Limits

Synchronous exports are capped at `5000` rows. Above that, the route returns a safe `413` with `ERR_EXPORT_BACKGROUND_REQUIRED_001` and points callers to `POST /api/exports/contracts`. Synchronous artifact-size failures use `ERR_EXPORT_TOO_LARGE_001`; background artifact-size failures use `ERR_EXPORT_BACKGROUND_ARTIFACT_TOO_LARGE_001`.

Preset query behavior:
- Basic Contract Register fetches only contract/register metadata.
- Workflow Export adds reminders and renewal decisions.
- Notes & Decisions Export is the only selectable preset that fetches notes.
- Intelligence Export adds workflow fields and calculated risk/financial fields, but does not fetch notes.

Text bounds:
- latest note preview is capped at `160` characters
- decision history summary is capped at `500` characters
- spreadsheet injection sanitization applies to all string fields
- XLSX generation has a preflight complexity envelope before workbook buffers are built
- general XLSX preflight rejects text-heavy Notes & Decisions workbooks above `7500` rows
- background XLSX exports are capped at the synchronous export envelope (`5000` rows) because the current workbook writer still buffers output
- background CSV exports assemble rows in scoped pages controlled by `BACKGROUND_EXPORT_PAGE_SIZE` and build CSV chunks before the final private artifact upload
- XLSX requests that exceed the safe generation envelope return `ERR_EXPORT_XLSX_TOO_LARGE_001` synchronously, or fail background processing with `ERR_EXPORT_BACKGROUND_XLSX_TOO_LARGE_001`
- CSV remains the preferred format for very large rich exports within the existing row limits
- background export artifacts fail safely above `50 MiB` with `ERR_EXPORT_BACKGROUND_ARTIFACT_TOO_LARGE_001`

Background export request processing now exists for larger preset exports. It uses `data_export_requests`, claims queued work through `/api/internal/export-jobs`, generates bounded CSV/XLSX payloads, stores artifacts in the private `SUPABASE_EXPORTS_BUCKET`, and records safe completion/failure metadata. Completed, unexpired artifacts are downloaded through `/api/exports/contracts/{id}/download`; storage paths and bucket names are never returned to customers.

Artifacts expire after seven days. Internal operations can run cleanup through `/api/internal/export-jobs` with `{ "mode": "cleanup_expired" }`, which deletes the private artifact and marks the request `expired`.

Background export worker behavior is config-driven:
- `BACKGROUND_EXPORT_PAGE_SIZE` controls row page size for background generation.
- `BACKGROUND_EXPORT_JOB_LIMIT` controls the default number of queued jobs processed by the internal export-jobs route.
- `REMINDER_PROCESSING_LEASE_MINUTES` and `OCR_PROCESSING_LEASE_MINUTES` control stale processing rescue thresholds for reminder and OCR workers.

Background CSV exports reduce worker memory pressure by avoiding one full in-memory `ExportRow[]` for the full job. They still materialize the final artifact once for Supabase Storage upload, so the `50 MiB` artifact limit remains a hard safety boundary.

Background XLSX exports remain intentionally stricter than CSV. The current `xlsx` library writes a buffered workbook, so XLSX is not treated as a true streaming format.

Background exports become necessary when customers need:
- more than `5000` rows
- full note history rather than preview/summary
- audit export packaging
- scheduled exports
- very large XLSX files

Full note history, audit export packaging, scheduled exports, streaming CSV/XLSX writers, chunked artifact generation, and data warehouse sync remain operational follow-ups, not shipped scope in this pass.

## Intelligence Calculation Assumptions

Intelligence dashboards should reuse shared page models and calculation helpers. They should not recalculate the same concepts independently in pages.

Performance assumptions:
- calculations run over active-organization contract rows only
- page models should accept already-scoped arrays and avoid page-local recalculation drift
- missing financial values produce warnings rather than fake precision
- multi-currency aggregation stays blocked without conversion policy
- low-trust data lowers confidence rather than becoming high-confidence output
- drilldowns use contract IDs already scoped to the organization

If dashboard input grows beyond low thousands of contracts, move aggregation closer to query helpers or materialized server summaries.

## Recommended Database Indexes

Review existing migrations before adding indexes. Prefer indexes that match real query filters and orderings.

Recommended high-confidence indexes:
- `contracts(organization_id)`
- `contracts(organization_id, updated_at desc)`
- `contracts(organization_id, owner_user_id)`
- `contracts(organization_id, status_tag)`
- `contracts(organization_id, department)`
- `contract_metadata(contract_id)`
- `reminders(contract_id, remind_at)`
- `reminders(status, remind_at)`
- `reminders(organization_id, status, remind_at)` if reminders carry organization scope in the schema
- `notes(contract_id, created_at desc)`
- `renewal_decisions(contract_id, decision_date desc, created_at desc)`
- `exports(organization_id, created_at desc)`
- `data_export_requests(organization_id, requested_at desc)`
- `data_export_requests(export_scope, status, requested_at)` for background worker claims
- `ocr_jobs(status, queued_at)`
- `audit_logs(organization_id, entity_type, created_at desc)`
- private Supabase storage bucket for `SUPABASE_EXPORTS_BUCKET`
- `organizations(billing_provider, billing_customer_id)`
- `organizations(billing_subscription_id)`

Avoid speculative indexes on rarely filtered columns. Every index adds write overhead.

## Known Scale Risks

- Contract detail still loads many adjacent records; keep large raw payloads out of customer UI and consider pagination for audit/notes if they grow.
- Procurement analytics currently builds several summaries in memory; materialized summaries may be needed for very large portfolios.
- CSV artifacts are assembled from page chunks but still materialized before upload; preflight and artifact limits reduce risk, but true full-scale export needs direct streaming upload or multipart chunk storage.
- XLSX generation is memory-bound; rich XLSX exports have preflight complexity caps, background exports are bounded at the worker layer, and artifacts expire after seven days.
- Reminder dispatch is capped per run and ordered by retry/due time.
- OCR jobs are capped per run and ordered by queue time.
- Admin/support operational snapshots use count/head queries and bounded recent windows for export, reminder, and OCR health instead of broad unbounded reads.

## Practical Load-Test Plan

Use the lightweight k6 scaffold in `scripts/load/noticecontrol-staging-smoke.k6.js` against staging-like environments with production-equivalent Supabase limits. This is the current k6 or Artillery-compatible load-test plan; it is wired through `npm run load:staging:k6` and uses synthetic/safe payloads only.

Example:

```bash
BASE_URL=https://staging.noticecontrol.example \
AUTH_COOKIE="staging-auth-cookie" \
STAGING_INTERNAL_OPERATIONS_SECRET="staging-ops-secret" \
STAGING_INTERNAL_OCR_SECRET="staging-ocr-secret" \
STAGING_CRON_SECRET="staging-cron-secret" \
npm run load:staging:k6
```

Do not point this script at production unless a production incident commander explicitly approves the window, data set, and rate limits. Do not embed real secrets in the script; pass staging-only values through environment variables.

Recommended data sets:
- 500 contracts, 5 owners, 10 departments, 2 reminders per contract
- 5,000 contracts, 50 owners, 50 departments, 5 reminders per contract
- 5,000 contracts with 20 notes and 10 renewal decisions per contract for rich export stress
- OCR queue with 500 pending jobs
- reminder queue with 5,000 due or retry-pending reminders

Workflows to test:
- dashboard home and contracts list load
- contract detail load for contracts with many notes/reminders/decisions
- risk queue, financial intelligence, and procurement analytics render
- synchronous export below `5000` rows
- background export request, processing, status, download, and cleanup
- reminder dispatch cron
- OCR jobs internal route
- billing webhook replay validation

Success criteria:
- user-facing pages avoid unbounded relation scans
- sync exports return or fail with the documented limit code
- background exports complete within operational batch windows or fail with safe codes
- reminder/OCR routes process only bounded batches
- no logs, monitoring events, or route errors include raw contract text, notes, OCR output, storage paths, or provider secrets

## Deferred Scale Features

Do not implement these as part of scale hardening without shipped-kernel approval:
- customer API
- scheduled exports
- Slack/Teams alerts
- monthly digest
- approvals
- negotiation tracking
- full CLM workflows
