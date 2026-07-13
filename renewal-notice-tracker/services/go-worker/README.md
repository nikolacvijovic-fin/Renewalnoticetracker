# Go Reliability Worker

Scaffolded worker for reliable background processing:

- trusted reminder delivery jobs
- import processing jobs
- webhook dispatch normalization
- audit event processing
- idempotency and retry classification

This service does not send production email, SMS, or webhooks yet. Provider integrations must be added behind explicit interfaces and idempotency keys.

## Run

```bash
go test ./...
go run ./cmd/worker --health
```
