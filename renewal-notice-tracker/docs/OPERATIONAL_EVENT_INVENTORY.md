# NoticeControl Operational Event Inventory

Monitoring currently emits through structured server logs via `lib/observability/monitoring.ts`. A future provider can consume the same normalized event shape without changing route or business code.

| Event name | Source | Signal type | Org/user context | Sensitivity | Alert | Severity |
| --- | --- | --- | --- | --- | --- | --- |
| `internal_route_auth_failed` | `lib/http/route-handler.ts` internal auth helpers | structured log + monitoring | request ID, route; no user by default | internal | yes | P2 |
| `route_unexpected_error` | shared route handler | structured log | org/user when auth resolved | internal/customer-sensitive by route | no direct alert | P2/P3 follow-up |
| `export_denied` | `lib/contracts/export-route.ts` | structured log + audit where applicable | org/user when auth resolved | customer_sensitive | no single alert | P3 |
| `export_failed` | `lib/contracts/export-route.ts` | structured log + monitoring | org/user, preset, format | customer_sensitive for rich presets | yes | P2 |
| `export_too_large` | `lib/contracts/export-route.ts` | structured log + monitoring | org/user, preset, format, row count | customer_sensitive for rich presets | no | P3 |
| `export_background_failed` | `lib/contracts/background-exports.ts` | structured log + monitoring + audit | org/user, export request ID, preset, format | customer_sensitive for rich presets | yes | P2 |
| `export_background_download_failed` | `lib/contracts/background-exports.ts` | monitoring + route error | org/user, export request ID, preset, format | customer_sensitive for rich presets | yes | P2 |
| `export_background_cleanup_failed` | `lib/contracts/background-exports.ts` cleanup | monitoring | org/user, export request ID, preset, format | customer_sensitive for rich presets | yes | P2 |
| `export_jobs_route_failed` | `app/api/internal/export-jobs/route.ts` | monitoring + route error | request ID, route | internal | yes | P2 |
| `reminder_dispatch_failed` | `app/api/cron/send-reminders/route.ts` | structured log + monitoring | request ID, route | customer_sensitive | yes | P1 |
| `ocr_job_failed` | `lib/ocr/jobs.ts` | structured log + monitoring + processing error | org, contract ID, job ID | customer_sensitive | yes | P2 |
| `billing_webhook_failed` | `app/api/webhooks/billing/paddle/route.ts` | structured log + monitoring | request ID, provider | restricted | yes | P1 |
| `workspace_deletion_attempted` | `app/api/internal/workspace-deletion/route.ts` | structured log | request ID, route | restricted | no | P3 |
| `workspace_deletion_route_failed` | `app/api/internal/workspace-deletion/route.ts` | structured log + monitoring | request ID, route | restricted | yes | P1 |
| `intelligence_access_denied` | risk explanation route and future sensitive intelligence routes | monitoring | org/user when auth resolved, surface | customer_sensitive | no single alert | P3 |
| `contracts.export_attempted` | export route | audit | org/user, preset, format | customer_sensitive if rich preset | no | P3 |
| `contracts.exported` | export route | audit + analytics after success | org/user, preset, row count, sections | customer_sensitive if rich preset | no | P3 |
| `contracts.export_background_requested` | background export request creation | audit | org/user, request ID, preset, format, sections | customer_sensitive if rich preset | no | P3 |
| `contracts.export_background_completed` | background export processor | audit | org/user, request ID, preset, format, row count | customer_sensitive if rich preset | no | P3 |
| `contracts.export_background_failed` | background export processor | audit | org/user, request ID, safe failure code/category | customer_sensitive if rich preset | yes if repeated | P2 |
| `contracts.export_background_downloaded` | background export download route | audit | org/user, request ID, preset, format, row count, artifact size | customer_sensitive if rich preset | no | P3 |
| `contracts.export_background_expired` | background export cleanup | audit | org/user, request ID, preset, format, artifact size | customer_sensitive if rich preset | no | P3 |
| `contracts.export_denied` | export route | audit | org/user, preset, denied reason | customer_sensitive | no single alert | P3 |
| `export_requested` | export route | analytics after success only | org/user, preset, row count | internal/customer_sensitive by preset | no | P3 |
| `reminders.preview_denied` | reminders API | audit | org/user, denied reason | internal | spike only | P3 |
| `contract.created` | upload/import action | audit + analytics | org/user, contract ID, file metadata | customer_sensitive | no | P3 |
| `note.created` | note action | audit | org/user, note ID, redacted metadata only | customer_sensitive | no | P3 |
| workspace deletion failed state | workspace deletion executor | DB state + audit/logs | org/request where available | restricted | yes | P1/P0 if data loss suspected |

## Alert Severity Policy

### P0

- Response time: immediate, page owner now.
- Operator action: stop affected path, preserve evidence, rotate secrets if relevant, block further destructive/export operations if needed.
- Customer communication trigger: confirmed or likely customer data exposure, tenant isolation failure, data loss, leaked secret, or unauthorized sensitive export.
- Escalation owner: incident commander plus engineering owner.
- Examples: suspected tenant isolation failure, leaked provider secret, destructive operation failure causing data loss, unauthorized rich export.

### P1

- Response time: within 30 minutes.
- Operator action: diagnose systemic failure, replay only idempotent/provider-supported events, keep customer-facing state truthful.
- Customer communication trigger: customer-visible workflow interruption or billing state risk lasting more than one operating window.
- Escalation owner: on-call engineer or release owner.
- Examples: `billing_webhook_failed` spike, `reminder_dispatch_failed` systemic failure, `workspace_deletion_route_failed`, OCR queue stuck.

### P2

- Response time: same business day or sooner if repeated.
- Operator action: inspect affected org/job/request, confirm retryability, watch for spike.
- Customer communication trigger: single customer impact that requires action or repeated failures in one workspace.
- Escalation owner: domain owner.
- Examples: single `export_failed`, single `ocr_job_failed`, repeated `internal_route_auth_failed`, repeated entitlement or intelligence denial spike.

### P3

- Response time: normal triage.
- Operator action: treat as expected friction unless counts spike.
- Customer communication trigger: none unless user reports confusion or repeated denials indicate configuration issue.
- Escalation owner: product/engineering triage.
- Examples: validation failures, expected user-level denied actions, normal billing state transitions, `export_too_large`, single `intelligence_access_denied`.

## Alert Data Safety

Alerts must never contain secrets, tokens, raw contract text, full notes, OCR output, extracted evidence, billing provider payloads, uploaded document contents, cookies, or internal diagnostic payloads. Use IDs, counts, status, preset names, route/action, request ID, and redacted error names instead.
