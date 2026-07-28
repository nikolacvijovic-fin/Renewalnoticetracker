# Go Reliability Worker

Signed worker foundation for reliable background processing:

- trusted reminder delivery jobs
- import processing jobs
- webhook dispatch normalization
- audit event processing
- idempotency and retry classification

This service does not hold Supabase service-role secrets and does not send production email directly. It signs requests to the Next.js app, claims trusted background jobs, and lets the TypeScript runtime perform provider delivery behind existing audit, billing, tenant-scope, and email policies.

## What This Teaches

- queue and worker process structure
- retry and idempotency semantics
- lease/stale-rescue thinking
- structured operational logging boundaries
- reliability-first service design

## Product Subsystem

Go owns reliability and background processing scaffolds: reminders, retries, queue polling, stale rescue, webhook normalization, and job status evidence.

Go does not own customer UI, billing truth, entitlement policy, contract review truth, or production email/provider sending until explicit provider adapters are added.

## Run

```bash
go test ./...
go run ./cmd/worker --health
NOTICECONTROL_APP_URL=https://staging.example.com ADD_ON_INTERNAL_SIGNING_SECRET=... go run ./cmd/worker
```

## Learning Tasks

Beginner:

- Run `go test ./...`.
- Read a retry classification test.

Intermediate:

- Add a deterministic queue fixture.
- Implement a fake repository for lease-safe worker polling.

Advanced:

- Move a background workflow behind bounded worker execution.
- Emit safe operational events for retry exhaustion and stale rescue.

## Integration With TypeScript

The Next.js app owns internal route contracts, job records, reminder delivery, and enterprise audit writes. Go consumes those contracts through signed internal boundaries:

- `NOTICECONTROL_APP_URL`
- `ADD_ON_INTERNAL_SIGNING_SECRET`
- `NOTICECONTROL_WORKER_ID`
- `NOTICECONTROL_WORKER_CLAIM_LIMIT`

The current loop calls `/api/internal/background-jobs/claim` with `processTrustedReminders=true`. This keeps provider secrets and delivery truth in the app while making Go useful as a deployable signed poller.

## Scaffolded vs Production-Ready

Current state: runtime-ready signed poller foundation. Production readiness still requires deployment isolation, queue-load testing, alert thresholds, and a decision on whether future workers should process some job types outside the TypeScript app.
