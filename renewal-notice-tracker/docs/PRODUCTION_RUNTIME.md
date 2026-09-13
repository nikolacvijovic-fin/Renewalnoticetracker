# Production Runtime

NoticeControl is deployed as four independently supervised processes. `Dockerfile` and
`compose.production.yml` are the provider-neutral reference definitions; a production platform may
translate them into equivalent services without changing the process boundaries.

## Process inventory and replica rules

| Process | Command / image target | Required replicas | Health signal | Responsibility |
| --- | --- | --- | --- | --- |
| Web | `npm start` / `app-runtime` | Two or more behind a load balancer | Authenticated `/api/internal/health?readiness=1` | HTTP product and internal worker APIs |
| PDF worker | `npm run worker:pdf` / `app-runtime` | One or more | Fresh heartbeat file | Claim and process PDF extraction jobs |
| Reminder worker | `/usr/local/bin/noticecontrol-worker` / `go-worker-runtime` | One or more | Fresh polling-loop heartbeat checked by `--health` | Claim and process durable reminder delivery jobs |
| Maintenance scheduler | `npm run scheduler` / `app-runtime` | Exactly one active replica | Fresh heartbeat file | Enqueue reminders, sync shipped subscription integrations, and clean stale PDF uploads |

Web and queue-worker replicas may scale horizontally because job claims are lease-based. Run exactly
one scheduler replica: the invoked routes are defensive, but duplicate schedulers create unnecessary
load and duplicate enqueue attempts. Every process needs an external supervisor with automatic restart
on non-zero exit. Do not run any worker as an ephemeral release command.

## Configuration and secrets

Start from `.env.example`, inject values through the deployment platform's secret store, and never
commit `.env.production`. Production startup requires the Supabase, email, billing, internal-route,
cron, and `ADD_ON_INTERNAL_SIGNING_SECRET` values validated by `lib/config.ts`. The scheduler and worker
intervals are bounded and fail closed when an explicit value is invalid. The scheduler and app must
share `CRON_SHARED_SECRET` and `ADD_ON_INTERNAL_SIGNING_SECRET`; each worker identity must be stable and
non-empty.

Use distinct production secrets. Do not reuse staging values. Rotate the scheduler/worker signing
secret as a coordinated deployment because signed internal requests cannot cross a mixed-secret rollout.

## Startup, health, and rollout

1. Build both Docker targets and run the release-critical test suite.
2. Produce and review a migration plan separately. Apply approved migrations before new application
   processes, using the existing migration rollout procedure; the runtime definitions never apply
   migrations automatically.
3. Start the web service and wait for authenticated readiness to return HTTP 200. The readiness probe
   validates database reachability and returns only `ok`/`failed`, never database error details.
4. Start the workers and the single scheduler. Their heartbeat files are local liveness signals and
   must be paired with supervisor restart alerts. A stale heartbeat or repeated polling failure is a
   process failure, not a healthy idle state.
5. Complete staging smoke and required end-to-end gates before shifting production traffic.

The reference Compose health check reads `INTERNAL_HEALTH_SECRET` only inside the workload. Do not
publish the internal readiness endpoint or its credential through a public monitoring URL.

## Scheduled workflow intervals

- Reminder enqueue: 60 seconds by default; minimum 15 seconds.
- Subscription usage sync: 15 minutes by default; minimum 60 seconds.
- Stale PDF upload cleanup: 24 hours by default; minimum one hour.
- Failed scheduler request retry: 60 seconds by default, bounded from 5 seconds to one hour.

Failed tasks retain an unhealthy state across idle scheduler cycles, retry on the bounded failure
interval, and cause the scheduler to exit after the configured threshold so its supervisor and alerting
can escalate the failure.

## Logs and alerts

The worker and scheduler emit one JSON object per event without secret values. Central logging must
retain `service`, `event`, `level`, timestamps, task IDs, counts, and consecutive-failure counts. Alert
on process restarts, non-zero exits, stale heartbeats, readiness failures, and failure-threshold events.
Route those alerts to the operational runbooks in `docs/OPERATIONAL_RUNBOOKS.md`.
