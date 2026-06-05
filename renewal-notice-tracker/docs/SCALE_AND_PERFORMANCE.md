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

Synchronous exports are capped at `5000` rows. Above that, the route returns a safe `413` with `ERR_EXPORT_BACKGROUND_REQUIRED_001` and points callers to `POST /api/exports/contracts`.

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
- text-heavy Notes & Decisions XLSX exports are capped at `7500` rows even in background processing
- XLSX requests that exceed the safe generation envelope return `ERR_EXPORT_XLSX_TOO_LARGE_001` synchronously, or fail background processing with `ERR_EXPORT_BACKGROUND_XLSX_TOO_LARGE_001`
- CSV remains the preferred format for very large rich exports within the existing row limits
- background export artifacts fail safely above `50 MiB` with `ERR_EXPORT_BACKGROUND_ARTIFACT_TOO_LARGE_001`

Background export request processing now exists for larger preset exports. It uses `data_export_requests`, claims queued work through `/api/internal/export-jobs`, generates bounded CSV/XLSX payloads, stores artifacts in the private `SUPABASE_EXPORTS_BUCKET`, and records safe completion/failure metadata. Completed, unexpired artifacts are downloaded through `/api/exports/contracts/{id}/download`; storage paths and bucket names are never returned to customers.

Artifacts expire after seven days. Internal operations can run cleanup through `/api/internal/export-jobs` with `{ "mode": "cleanup_expired" }`, which deletes the private artifact and marks the request `expired`.

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
- CSV/XLSX artifacts are still materialized before upload; preflight and artifact limits reduce risk, but true full-scale export needs streaming or chunked generation.
- XLSX generation is memory-bound; rich XLSX exports have preflight complexity caps, background exports are bounded at the worker layer, and artifacts expire after seven days.
- Reminder dispatch is capped per run and ordered by retry/due time.
- OCR jobs are capped per run and ordered by queue time.

## Practical Load-Test Plan

No runtime load-test harness is shipped yet. Use k6 or Artillery against a staging-like environment with production-equivalent Supabase limits.

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
