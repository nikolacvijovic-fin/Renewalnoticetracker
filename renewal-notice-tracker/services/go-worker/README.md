# Go Reliability Worker

Scaffolded worker for reliable background processing:

- trusted reminder delivery jobs
- import processing jobs
- webhook dispatch normalization
- audit event processing
- idempotency and retry classification

This service does not send production email, SMS, or webhooks yet. Provider integrations must be added behind explicit interfaces and idempotency keys.

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

The Next.js app owns internal route contracts and job records. Go consumes those contracts through trusted internal boundaries and must write status through tenant-scoped, auditable paths.

## Scaffolded vs Production-Ready

Current state: scaffolded. Production readiness requires real queue/repository adapters, provider-specific delivery interfaces, operational monitoring, and deployment isolation.
