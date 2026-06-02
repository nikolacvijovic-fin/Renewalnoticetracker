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

Background export request processing now exists for larger preset exports. It uses `data_export_requests`, claims queued work through `/api/internal/export-jobs`, generates bounded CSV/XLSX payloads, and records safe completion/failure metadata. Durable artifact storage and customer download URLs remain deferred, so completed background requests currently expose metadata only.

Background exports become necessary when customers need:
- more than `5000` rows
- full note history rather than preview/summary
- audit export packaging
- scheduled exports
- very large XLSX files

Full note history, audit export packaging, scheduled exports, and durable download storage remain operational follow-ups, not shipped scope in this pass.

## Intelligence Calculation Assumptions

Intelligence dashboards should reuse shared page models and calculation helpers. They should not recalculate the same concepts independently in pages.

Performance assumptions:
- calculations run over active-organization contract rows only
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
- `audit_logs(organization_id, entity_type, created_at desc)`
- `exports(organization_id, created_at desc)`
- `data_export_requests(organization_id, requested_at desc)`
- `data_export_requests(export_scope, status, requested_at)` for background worker claims
- `organizations(billing_provider, billing_customer_id)`
- `organizations(billing_subscription_id)`

Avoid speculative indexes on rarely filtered columns. Every index adds write overhead.

## Known Scale Risks

- Contract detail still loads many adjacent records; keep large raw payloads out of customer UI and consider pagination for audit/notes if they grow.
- Procurement analytics currently builds several summaries in memory; materialized summaries may be needed for very large portfolios.
- XLSX generation is memory-bound; background exports are bounded at the worker layer and still need durable artifact storage before customer download links ship.
- OCR and reminder jobs should keep bounded batch sizes and explicit retry/failure semantics.

## Deferred Scale Features

Do not implement these as part of scale hardening without shipped-kernel approval:
- customer API
- scheduled exports
- Slack/Teams alerts
- monthly digest
- approvals
- negotiation tracking
- full CLM workflows
