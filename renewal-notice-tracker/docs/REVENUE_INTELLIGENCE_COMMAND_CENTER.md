# Revenue Intelligence Command Center

Canonical runtime modules:

- `lib/revenue-intelligence/revenue-intelligence.ts`
- `lib/revenue-intelligence/revenue-intelligence-aggregator.ts`
- `lib/revenue-intelligence/revenue-intelligence-source-queries.ts`
- `components/revenue-intelligence/revenue-command-center.tsx`
- `app/dashboard/revenue-intelligence/page.tsx`

## What Ships

The Revenue Intelligence Command Center is a CFO-facing aggregation layer over existing NoticeControl evidence:

- reviewed contract metadata
- renewal quote comparisons and findings
- savings opportunities
- commercial decision workbench records
- negotiation briefs
- internal outreach draft opportunities
- trusted reminder and notice-deadline risk state

It produces safe, organization-scoped snapshots, risk signals, impact metrics, vendor/category summaries, forecast scenarios, executive insights, and evidence links.

## What Does Not Ship

This module does not add:

- external cold outreach
- email sending
- CRM enrichment
- live SaaS integrations
- AI negotiation
- automatic notice sending
- unsupported revenue forecasts from ungrounded data

Internal outreach remains draft-only and manual-copy only. Revenue Intelligence can summarize that evidence, but it does not deliver messages or run campaigns.

## Safety Boundaries

- Every persisted record is organization-scoped.
- Privileged writes are isolated in `lib/revenue-intelligence/repositories/admin-revenue-intelligence-repository.ts`.
- Source queries select bounded, normalized fields and avoid raw contract text, OCR output, provider payloads, storage paths, tokens, secrets, uploaded documents, and full notes.
- User-facing dashboard output is derived from stored metadata and commercial workflow evidence.
- Audit metadata uses safe IDs, counts, statuses, aggregate amounts, currency, and warning codes only.

## Audit Events

Emitted today:

- `revenue_intelligence.snapshot_generated`
- `revenue_intelligence.signals_refreshed`
- `revenue_intelligence.metrics_refreshed`
- `revenue_intelligence.vendor_category_refreshed`
- `revenue_intelligence.forecast_refreshed`
- `revenue_intelligence.insights_refreshed`
- `revenue_intelligence.insight_reviewed`
- `revenue_intelligence.signal_archived`
- `revenue_intelligence.refresh_job_enqueued`

Future worker events:

- `revenue_intelligence.refresh_job_completed`
- `revenue_intelligence.refresh_job_failed`

The future worker events are taxonomy contracts only until a real background processor emits them.

## Release Gate

Before expanding this module, keep these tests green:

- `npm run test:revenue-intelligence`
- `npm run test:v2-commercial-readiness`
- `npm run test:scope-freeze`

Any future expansion into external delivery, CRM sync, customer API exposure, or autonomous outreach requires a separate release gate, provider contracts, suppression model, approval workflow, audit taxonomy, RLS review, and privacy review.
