# NoticeControl Operational Maturity Guide

This guide is the contributor map for production safety work. It keeps infrastructure concerns out of page and route one-offs.

## Shipped Kernel Boundary

The shipped kernel remains the vendor-side renewal-control loop: upload/import, P0 review, owner assignment, trusted reminders, acknowledgment, decision, close/reopen, safe exports, billing, and internal rescue. Slack, Teams, monthly digest, playbooks, approvals, negotiation tracking, customer API, and full CLM workflows remain deferred unless explicitly promoted through shipped-kernel review.

## Route Handler Pattern

High-risk API routes should use `createRouteHandler` from `lib/http`.

Use it for routes that involve:
- auth or role checks
- billing or entitlement checks
- internal secrets
- writes
- contract, billing, OCR, reminder, export, intelligence, or audit data

Expected shape:
- `auth` owns authentication and permission gates.
- `parse` owns body/query validation.
- handler owns the business operation and response.
- route errors return structured safe errors with `code` and `requestId`.
- unexpected server errors are logged through structured server logs without raw sensitive payloads.

Manual `NextResponse.json` routes are acceptable only for inert public placeholders or when there is a documented reason not to use the shared handler.

## Billing And Entitlement Pattern

Billing truth flows through canonical billing snapshot and entitlement helpers. Routes should not manually assemble billing state from raw organization fields.

Exports use preset-level gates:
- basic export uses the `exports` commercial feature.
- workflow and notes presets use Growth-equivalent workflow/risk gating.
- intelligence export also checks intelligence access.
- audit export is deferred until redaction and scope are hardened.

## Export Preset Model

Export shape is owned by `lib/contracts/export.ts`.

Routes accept:
- `/dashboard/contracts/export/csv`
- `/dashboard/contracts/export/xlsx`
- optional `?preset=...`

Default preset is `basic_contract_register`. Notes, intelligence fields, evidence, and audit logs must not appear in the default export.

## Intelligence Access Pattern

Intelligence access is centralized in `lib/intelligence/access.ts`. Pages and routes should ask for the relevant surface rather than copying plan or role logic.

Risk badges, explanations, queues, financial intelligence, and procurement analytics may intentionally differ by role, but the difference must be encoded in the shared access model and covered by consistency tests.

## Audit, Analytics, And Logs

Use each signal for the right job:
- Audit logs: customer/accountability evidence for meaningful business actions and denials.
- Analytics: product event taxonomy and usage interpretation.
- Structured server logs: operational diagnosis for failures, auth failures, and route health.

Never log secrets, auth tokens, cookies, payment provider payload secrets, raw contract text, full notes, OCR document text, raw extraction payloads, raw evidence snippets, or uploaded document contents.

## Monitoring Readiness Map

Monitoring currently emits through `lib/observability/monitoring.ts` into the `structured_log` sink. Callers should only use `emitOperationalEvent`; future alerting providers should be added behind the sink resolver so route and business code do not change. See `docs/OPERATIONAL_EVENT_INVENTORY.md` for the event inventory and P0/P1/P2/P3 severity policy, and `docs/OPERATIONAL_RUNBOOKS.md` for operator response steps.

Optional external alert fanout:
- `MONITORING_EVENT_SINK=structured_log` keeps the current default behavior.
- `MONITORING_EVENT_SINK=structured_log_and_webhook` keeps structured logs and sends alert-worthy events to `MONITORING_ALERT_WEBHOOK_URL`.
- `MONITORING_ALERT_WEBHOOK_SIGNING_SECRET` optionally signs webhook payloads.
- `MONITORING_ALERT_WEBHOOK_TIMEOUT_MS` bounds delivery time so alert fanout does not become business-path availability risk.
- `MONITORING_ALERT_WEBHOOK_DELIVERY_MODE=await` waits only for the bounded timeout; `fire_and_forget` returns after structured logging and schedules delivery.
- Missing webhook config must not break local/dev while the default sink is `structured_log`.
- During alert-provider incidents, disable fanout with `MONITORING_EVENT_SINK=structured_log`; route and worker callers should not change.

Operational runtime knobs are validated in `lib/config.ts` and read through `getAppConfig().operations`:
- `BACKGROUND_EXPORT_PAGE_SIZE` controls background export row paging.
- `BACKGROUND_EXPORT_JOB_LIMIT` controls the default internal export worker claim limit.
- `REMINDER_PROCESSING_LEASE_MINUTES` controls stale reminder rescue.
- `OCR_PROCESSING_LEASE_MINUTES` controls stale OCR job rescue.

Do not reintroduce hardcoded worker defaults in routes or processors when these config values exist.

Internal support diagnostics use the same safety model. The ops panel and ops snapshot route may show IDs, counts, status, retry state, stale-processing age, failure codes, row/page counts, and artifact sizes. They must not show storage object paths, raw contract text, full notes, OCR output, extracted evidence, provider payloads, billing tokens, or uploaded document contents.

Admin/support snapshots must stay bounded. Prefer exact count/head queries, status-specific counts, and small recent windows over broad table reads. Debug views should display stable `failure_code` / `failure_category` values and IDs rather than raw human-readable error strings.

Job-health visibility currently covers:
- background exports: queued, processing, completed, failed, expired, stale processing, oldest queued age, oldest processing age
- reminders: processing, retry pending, terminal failures, stale processing, retry/terminal lifecycle events
- OCR jobs: queued, processing, retry pending, terminal failures, stale processing, oldest queued age, oldest processing age

Support should use these diagnostics before manual rescue. A stale job is a signal to inspect the safe job row and rerun only through the authorized internal route or audited admin action.

Critical events and current signal sources:

| Event | Source route/action | Audit event | Analytics event | Log event | Severity | Owner response |
| --- | --- | --- | --- | --- | --- | --- |
| Reminder dispatch failure | `app/api/cron/send-reminders/route.ts`, reminder processor | Reminder delivery failure records where applicable | None by default | `reminder_dispatch_failed`, plus generic `route_unexpected_error` | High | Check mail/provider status, inspect failed reminder rows, confirm retryability before rerun. |
| Export failure | `lib/contracts/export-route.ts` and `lib/contracts/background-exports.ts` | `contracts.export_attempted`; `contracts.exported` only after success; background request/completed/failed/downloaded/expired audit | `export_requested` only after sync success | `export_failed`, `export_background_failed`, lifecycle monitoring events | High | Confirm export preset, org scope, entitlement state, and storage/query health. Do not manually assemble payloads. |
| OCR/extraction failure | `lib/ocr/jobs.ts`, `app/api/internal/ocr-jobs/route.ts` | Processing error rows where available | None by default | `ocr_job_failed`, `ocr_job_retry_scheduled`, `ocr_job_terminal_failed`, `ocr_job_stale_rescued` | High | Inspect job row and file metadata, rerun through authorized OCR job path only. |
| Billing webhook failure | `app/api/webhooks/billing/paddle/route.ts` | Billing state/audit records only after verified updates | None by default | `billing_webhook_received`, `billing_webhook_replayed`, `billing_webhook_succeeded`, `billing_webhook_failed` | Critical | Verify Paddle signature/config, replay from provider if safe, and reconcile billing snapshot. |
| Destructive operation attempt | `app/api/internal/workspace-deletion/route.ts` | Workspace deletion request records | None | `workspace_deletion_attempted` | High | Confirm request ID, operator intent, and destructive auth evidence before allowing reruns. |
| Destructive operation failure | Workspace deletion executor and internal route | Workspace deletion failed state with evidence | None | `workspace_deletion_route_failed` | Critical | Stop retries until failure stage is understood; never mark completed after partial failure. |
| Internal route auth failure | Shared route auth helpers | Usually none, unless the route has a business denial audit | None | `internal_route_auth_failed` | Medium | Check secret purpose, caller identity, HMAC/timestamp where destructive, and rotate if suspicious. |
| Intelligence access denial | Intelligence routes/pages using shared access helpers | Intelligence/access-denial audit where implemented | Product analytics only if explicitly non-sensitive | Route-specific denial or shared route failure logs | Medium | Verify plan, role, owner scope, and active organization context. Do not infer billing state locally. |
| Workspace deletion request/failure | Workspace deletion request lifecycle | Workspace deletion request/failure audit state | None | `workspace_deletion_attempted`, `workspace_deletion_route_failed` | Critical | Review request lifecycle, failure evidence, and tenant isolation before any manual rescue. |

If alerting infrastructure is added later, wire alerts from these named structured log events and audit records rather than scraping user-visible errors.
