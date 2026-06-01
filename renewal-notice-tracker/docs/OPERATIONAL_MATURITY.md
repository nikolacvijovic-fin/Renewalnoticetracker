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

Critical events and current signal sources:

| Event | Source route/action | Audit event | Analytics event | Log event | Severity | Owner response |
| --- | --- | --- | --- | --- | --- | --- |
| Reminder dispatch failure | `app/api/cron/send-reminders/route.ts`, reminder processor | Reminder delivery failure records where applicable | None by default | `reminder_dispatch_failed`, plus generic `route_unexpected_error` | High | Check mail/provider status, inspect failed reminder rows, confirm retryability before rerun. |
| Export failure | `lib/contracts/export-route.ts` via CSV/XLSX routes | `contracts.export_attempted`; `contracts.exported` only after success; `contracts.export_denied` for denials | `export_requested` only after success | `export_failed` | High | Confirm export preset, org scope, entitlement state, and storage/query health. Do not manually assemble payloads. |
| OCR/extraction failure | `lib/ocr/jobs.ts`, `app/api/internal/ocr-jobs/route.ts` | Processing error rows where available | None by default | `ocr_job_failed` | High | Inspect job row and file metadata, rerun through authorized OCR job path only. |
| Billing webhook failure | `app/api/webhooks/billing/paddle/route.ts` | Billing state/audit records only after verified updates | None by default | `billing_webhook_failed` | Critical | Verify Paddle signature/config, replay from provider if safe, and reconcile billing snapshot. |
| Destructive operation attempt | `app/api/internal/workspace-deletion/route.ts` | Workspace deletion request records | None | `workspace_deletion_attempted` | High | Confirm request ID, operator intent, and destructive auth evidence before allowing reruns. |
| Destructive operation failure | Workspace deletion executor and internal route | Workspace deletion failed state with evidence | None | `workspace_deletion_route_failed` | Critical | Stop retries until failure stage is understood; never mark completed after partial failure. |
| Internal route auth failure | Shared route auth helpers | Usually none, unless the route has a business denial audit | None | `internal_route_auth_failed` | Medium | Check secret purpose, caller identity, HMAC/timestamp where destructive, and rotate if suspicious. |
| Intelligence access denial | Intelligence routes/pages using shared access helpers | Intelligence/access-denial audit where implemented | Product analytics only if explicitly non-sensitive | Route-specific denial or shared route failure logs | Medium | Verify plan, role, owner scope, and active organization context. Do not infer billing state locally. |
| Workspace deletion request/failure | Workspace deletion request lifecycle | Workspace deletion request/failure audit state | None | `workspace_deletion_attempted`, `workspace_deletion_route_failed` | Critical | Review request lifecycle, failure evidence, and tenant isolation before any manual rescue. |

If alerting infrastructure is added later, wire alerts from these named structured log events and audit records rather than scraping user-visible errors.
