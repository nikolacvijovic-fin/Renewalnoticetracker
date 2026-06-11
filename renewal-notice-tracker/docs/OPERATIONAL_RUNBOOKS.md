# NoticeControl Operational Runbooks

These runbooks are for production support of the shipped renewal-control kernel. They intentionally use IDs, status, counts, failure codes, categories, and audit records. Do not paste raw contract text, full notes, OCR output, extracted evidence, billing provider payloads, storage paths, tokens, cookies, or secrets into alerts, tickets, logs, or incident notes.

## First Response Rules

- Confirm severity from `docs/OPERATIONAL_EVENT_INVENTORY.md`: P0, P1, P2, or P3.
- Preserve evidence using audit IDs, request IDs, organization IDs, actor user IDs, job IDs, contract IDs, failure codes, and timestamps.
- Do not manually edit customer data unless the path is an audited internal rescue flow.
- If tenant isolation, unauthorized export, data exposure, destructive data loss, or leaked secret is suspected, treat as P0 until disproven.
- If a provider/webhook/worker path is systemically failing, treat as P1 even if the first visible symptom affects one customer.

## Export Job Failure Or Runaway Queue

Severity:
- P1 for systemic queue failure, repeated `export_background_failed`, missing artifact storage config, or runaway queued/processing counts.
- P2 for a single failed export with safe failure evidence.
- P0 if unauthorized sensitive export or tenant isolation is suspected.

Signals:
- Monitoring: `export_background_failed`, `export_jobs_route_failed`, `export_background_cleanup_failed`, `export_background_download_failed`.
- Audit: `contracts.export_background_requested`, `contracts.export_background_failed`, `contracts.export_background_completed`, `contracts.export_background_downloaded`.
- Admin snapshot: export queued, processing, failed, expired, stale processing, row/page/artifact counts.

Operator actions:
- Check `failure_code`, `failure_category`, `export_request_id`, preset, format, row count, page count, and artifact size.
- Verify `SUPABASE_EXPORTS_BUCKET`, `BACKGROUND_EXPORT_PAGE_SIZE`, and `BACKGROUND_EXPORT_JOB_LIMIT`.
- Prefer rerunning via `/api/internal/export-jobs` with the operations secret only after confirming scope and retry safety.
- For large rich XLSX failures, recommend CSV or narrower preset/window rather than manual artifact assembly.
- Do not inspect or expose note previews, storage object paths, raw evidence, or generated artifact content in support channels.

Customer communication trigger:
- Customer-visible export inability lasting more than one operating window, repeated failures in one workspace, or any suspected unauthorized export.

## OCR Queue Stuck Or High Terminal Failures

Severity:
- P1 for OCR queue stuck, provider outage, or repeated terminal failures.
- P2 for a single `ocr_job_failed` or `ocr_job_terminal_failed`.

Signals:
- Monitoring: `ocr_job_failed`, `ocr_job_retry_scheduled`, `ocr_job_terminal_failed`, `ocr_job_stale_rescued`.
- Admin snapshot: OCR queued, processing, retry pending, terminal failures, stale processing, oldest queued age, oldest processing age.
- Processing errors: safe failure code/category and contract/job IDs only.

Operator actions:
- Check OCR job ID, organization ID, contract ID, attempts, status, and stable failure code.
- Verify `OCR_PROCESSING_LEASE_MINUTES`, OCR provider config, and provider health.
- Rerun only through the authorized OCR internal route using the OCR jobs secret.
- Never paste OCR output, uploaded document contents, extracted text, evidence snippets, or storage paths into logs or tickets.

Customer communication trigger:
- OCR processing delays block review for customer-visible imports, repeated terminal failures, or provider outage.

## Reminder Dispatch Failures

Severity:
- P1 for systemic reminder dispatch failure.
- P2 for terminal reminder failures or repeated stale rescues.
- P3 for isolated retry scheduling that remains within normal retry policy.

Signals:
- Monitoring: `reminder_dispatch_failed`, `reminder_terminal_failed`, `reminder_retry_scheduled`, `reminder_stale_rescued`.
- Audit/analytics: reminder sent/failed events where applicable.
- Admin snapshot: retry pending, failed terminal, stale processing, lifecycle events.

Operator actions:
- Check reminder ID, contract ID, organization ID, attempt count, max attempts, next retry, and failure code.
- Verify `REMINDER_PROCESSING_LEASE_MINUTES`, email provider config, and resend/provider health.
- Rerun through audited internal/admin actions only.
- Do not expose recipient lists beyond masked/safe destination metadata.

Customer communication trigger:
- Missed reminder window, terminal failure affecting a trusted reminder, or provider outage lasting more than one operating window.

## Billing Webhook Failures Or Replays

Severity:
- P1 for `billing_webhook_failed` spike, signature verification failure after config change, or entitlement state drift.
- P2 for a single replay or isolated provider issue.

Signals:
- Monitoring: `billing_webhook_received`, `billing_webhook_replayed`, `billing_webhook_succeeded`, `billing_webhook_failed`.
- Billing snapshot and entitlement checks.
- Provider dashboard event IDs.

Operator actions:
- Verify provider, event type, request ID, signature status, and billing customer/subscription IDs.
- Confirm `PADDLE_WEBHOOK_SECRET` and provider environment.
- Replay only idempotent/provider-supported events.
- Never log raw provider payloads, billing secrets, tokens, or payment details.

Customer communication trigger:
- Entitlement is wrong, checkout/manage billing is blocked, or billing state cannot be reconciled within one operating window.

## Suspected Sensitive-Data Logging Issue

Severity:
- P0 for leaked secret, raw contract text, full note, OCR output, provider payload, storage path, or tenant-sensitive evidence in logs/alerts.

Signals:
- Operator report, log search hit, monitoring payload inspection, or customer report.

Operator actions:
- Stop the leaking route/worker if active.
- Preserve request IDs and log entry IDs without copying sensitive values.
- Rotate exposed secrets if any token/secret may have leaked.
- Patch sanitizer or call site, then run privacy/monitoring tests.
- Review adjacent logs/alerts for the same marker class.

Customer communication trigger:
- Confirmed or likely customer data exposure, leaked secret, or third-party alert sink exposure.

## Tenant Isolation Or Unauthorized Export Incident

Severity:
- P0 until disproven.

Signals:
- `export_denied` anomalies, unexpected `contracts.exported`, cross-org access report, route authz failure, audit mismatch, or customer report.

Operator actions:
- Freeze affected export/intelligence/internal operation if needed.
- Preserve organization ID, actor user ID, export request ID, preset, format, row count, and audit IDs.
- Confirm active organization scope, role, plan/entitlement gate, and export preset.
- Do not download or inspect artifacts unless incident commander approves and the action is audited.
- Rotate or revoke credentials if internal auth or webhook secrets are implicated.

Customer communication trigger:
- Any confirmed or likely unauthorized sensitive export, tenant isolation failure, or customer data exposure.

## Backup Or Restore Evidence Issue

Severity:
- P1 if restore evidence is missing/stale during a production incident or backup readiness cannot be established.
- P2 for stale backup/restore evidence outside an active incident.

Signals:
- Internal backup readiness route, restore drill route, operational traces, admin snapshot blockers/warnings.

Operator actions:
- Check latest backup check, latest restore test, request ID, status, and failure code/category.
- Rerun only through authorized operations route.
- Do not expose backup storage paths or raw restore payloads.
- Escalate if evidence is stale and a destructive or data-loss incident is active.

Customer communication trigger:
- Backup/restore readiness affects recovery commitments or a customer-facing incident.

## External Alert Sink Operations

Current default:
- `MONITORING_EVENT_SINK=structured_log`

Optional external alert fanout:
- `MONITORING_EVENT_SINK=structured_log_and_webhook`
- `MONITORING_ALERT_WEBHOOK_URL=https://...`
- `MONITORING_ALERT_WEBHOOK_SIGNING_SECRET=...` optional HMAC signing secret
- `MONITORING_ALERT_WEBHOOK_TIMEOUT_MS=2500` default bounded delivery timeout
- `MONITORING_ALERT_WEBHOOK_DELIVERY_MODE=await` waits only for the bounded timeout
- `MONITORING_ALERT_WEBHOOK_DELIVERY_MODE=fire_and_forget` returns after structured logging and schedules webhook delivery

Rules:
- Only alert-worthy events (`alert: true`) are sent to the webhook sink.
- Structured logs remain the baseline signal.
- Payloads are normalized and sanitized before sink delivery.
- When signing is configured, the webhook includes `x-noticecontrol-signature-sha256` as a lowercase hex HMAC-SHA-256 digest over the exact JSON request body, with no prefix.
- Failed or timed-out webhook delivery logs safe metadata only and must not fail the business route.
- Request-path events should keep the timeout short; switch back to `MONITORING_EVENT_SINK=structured_log` to disable webhook fanout during an alert-provider incident.
- Worker-path events may use the same bounded `await` mode for better delivery evidence; `fire_and_forget` reduces request latency but may lose delivery if the process exits.
