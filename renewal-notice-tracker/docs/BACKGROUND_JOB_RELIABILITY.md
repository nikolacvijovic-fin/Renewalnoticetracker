# Background Job Reliability

NoticeControl uses a trusted background job ledger for enterprise-sensitive work that should not run inline in user or cron request paths.

## Job Model

The canonical tables are:

- `background_jobs`
- `background_job_attempts`

Jobs are scoped by `organization_id`, optionally linked to `contract_id`, and idempotent by `(organization_id, idempotency_key)`.

Enqueue is insert-first. If `(organization_id, idempotency_key)` already exists, the existing job is returned unchanged. Duplicate enqueue never rewrites payload, schedule, priority, max attempts, contract link, or terminal state.

Supported job types:

- `trusted_reminder_delivery`
- `contract_import_processing`
- `audit_event_flush`
- `webhook_dispatch`
- `add_on_task`

Supported statuses:

- `queued`
- `processing`
- `retry_scheduled`
- `completed`
- `failed`
- `dead_lettered`
- `cancelled`

Terminal statuses are:

- `completed`
- `failed`
- `dead_lettered`
- `cancelled`

Terminal jobs cannot be mutated by normal queue operations.

## Security Boundary

Organization members may read scoped jobs and attempts. They cannot insert, update, or delete jobs directly.

Mutation is trusted-server only through:

- TypeScript queue helpers in `lib/background-jobs`
- Scoped service-role repository code
- Signed internal worker routes under `/api/internal/background-jobs/*`

Worker requests use the add-on signing model:

- `x-noticecontrol-worker-id`
- `x-noticecontrol-timestamp`
- `x-noticecontrol-body-sha256`
- `x-noticecontrol-signature`

The signature covers method, path, timestamp, and request body hash. Expired, unsigned, body-hash-mismatched, or worker-id-less requests fail closed.

State transitions are worker-owned:

- Completion requires matching `organization_id`, `id`, `status = processing`, and `locked_by = workerId`.
- Failure requires matching `organization_id`, `id`, `status = processing`, and `locked_by = workerId`.
- Cancellation only applies to `queued`, `retry_scheduled`, or intentionally cancelled `processing` jobs.
- Stale workers and wrong workers receive safe state-conflict responses instead of mutating the job.

## Trusted Reminder Delivery Flow

The cron route now queues due trusted reminder delivery jobs. It does not send reminder email inline.

Flow:

1. Cron finds due `pending` or `retry_pending` reminders.
2. Cron enqueues `trusted_reminder_delivery` jobs with stable idempotency keys.
3. The Go worker polls the signed internal claim endpoint.
4. The TypeScript runner claims jobs and re-checks the reminder gate.
5. If the gate is blocked, no email is sent and the job fails with `ERR_TRUSTED_REMINDER_GATE_BLOCKED_001`.
6. If delivery succeeds, the job is completed.
7. Transient failures retry with backoff.
8. Exhausted retryable failures move to `dead_lettered`.

The existing reminder delivery engine still owns email idempotency, duplicate suppression, reminder runs, notification logs, and analytics.

## Retry And Dead-Letter Policy

Transient categories include provider failures and timeouts. Backoff is exponential and capped at 60 minutes.

Permanent failures are not retried. Retryable failures become dead-lettered once `max_attempts` is reached.

Safe failure metadata may include:

- job id
- reminder id
- contract id
- organization id
- worker id
- failure code
- failure category
- attempt count
- next retry time

Never include raw contract text, OCR output, full notes, provider payloads, storage paths, secrets, tokens, or email bodies in job metadata, attempts, logs, monitoring, or audit evidence.

## Audit Events

Trusted reminder delivery emits enterprise audit evidence:

- `trusted_reminder_delivery.enqueued`
- `trusted_reminder_delivery.claimed`
- `trusted_reminder_delivery.sent`
- `trusted_reminder_delivery.retry_scheduled`
- `trusted_reminder_delivery.dead_lettered`
- `trusted_reminder_delivery.cancelled`
- `trusted_reminder_delivery.blocked_by_gate`

These events complement operational logs and monitoring. They do not replace customer-facing audit truth.

## Operator Visibility

Internal operators can inspect job health at:

- `/admin/background-jobs?organizationId=...`

The page shows queued, processing, retry-scheduled, dead-lettered, recent attempts, oldest queued age, and trusted reminder delivery failure rate. Cancel/retry actions remain placeholders until reviewed.

## Known Limitations

- The Go worker currently acts as a signed poller and invokes the TypeScript app to process trusted reminder jobs.
- Direct provider email delivery stays in the TypeScript app.
- Full distributed worker leases should be stress-tested against a real Supabase instance.
- Exact queue metrics should eventually move to SQL aggregate views or RPCs.
