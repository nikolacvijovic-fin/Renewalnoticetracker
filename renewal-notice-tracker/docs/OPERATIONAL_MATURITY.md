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

## Monitoring Readiness Checklist

Critical events and current signal sources:

- Reminder dispatch failures: `reminder.delivery_failed` audit/event paths and structured `route_unexpected_error` logs from reminder routes.
- Export failures: structured `route_unexpected_error` logs on export routes, plus `contracts.export_denied`, `contracts.export_attempted`, and `contracts.exported` audit records.
- OCR/extraction failures: `processing_errors` rows and `ocr_job_failed` structured logs.
- Billing webhook failures: billing webhook route errors and billing audit/update records.
- Destructive operation attempts/failures: destructive internal route auth failures, workspace deletion failed states, and workspace deletion audit records.
- Internal route auth failures: structured `internal_route_auth_failed` logs with route, request ID, status, and code only.

If alerting infrastructure is added later, wire alerts from these structured log event names and audit records rather than scraping user-visible errors.
