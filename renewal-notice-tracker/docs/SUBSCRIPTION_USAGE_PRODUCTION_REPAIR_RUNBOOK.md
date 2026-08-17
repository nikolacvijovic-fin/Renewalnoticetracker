# Subscription Usage Production Repair Runbook

## Deployment order

1. Back up the database and record the current migration head.
2. Deploy migration `202608180001_subscription_usage_production_repair.sql` after `202608170002_google_workspace_overlap_optimization.sql`.
3. Deploy the Next.js application, Python intelligence service, and Java connector from the same revision.
4. Configure provider and internal secrets, then invoke `POST /api/cron/subscription-usage-sync` daily with `x-cron-secret: <CRON_SHARED_SECRET>` from the approved scheduler.
5. Reconnect existing provider connections so verified permissions are populated. Until then, scheduled Google synchronization fails closed with `permission_error`.
6. Validate one non-production Microsoft tenant and one non-production Google Workspace tenant before customer access.

Required runtime configuration:

- `MICROSOFT_365_CLIENT_ID`, `MICROSOFT_365_CLIENT_SECRET`, `MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI`
- `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET`, `GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI`, `GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY`
- `ADD_ON_INTERNAL_SIGNING_SECRET`, `CRON_SHARED_SECRET`
- `JAVA_ENTERPRISE_CONNECTORS_URL`, `PYTHON_INTELLIGENCE_URL`
- Supabase URL, anon key, and service-role key already required by the application

## Runtime behavior

The scheduler claims only due `connected` connections through a service-only `FOR UPDATE SKIP LOCKED` function. Claims expire, abandoned scheduled runs are marked failed, per-process provider requests are rate-limited, concurrency is bounded, and one organization's failure does not stop other claimed work. Success schedules the next daily run; recoverable provider failures use backoff; revoked, expired, permission, tenant, and verification failures stop future scheduling.

Each reconciliation records an immutable snapshot set. It contains the current provider batch and at most the latest successful snapshot from each other connected provider. Manual imports are excluded unless the current analysis is explicitly manual. Queries are organization- and batch-scoped, deterministic, paged, and fail rather than silently truncate above 10,000 rows.

Finding persistence runs in one database transaction. Repeated evidence is associated with the new analysis scope without reopening review decisions. Materially changed evidence creates a linked revision. Empty results resolve only open findings in the same scope family; accepted, rejected, deferred, and action-planned history is retained.

## Rollback and forward fix

This is an additive migration. Do not drop the new consent, scope, or association tables and do not remove finding revision columns after data exists. To stop the feature safely, disable the scheduler, disconnect provider connections, and roll the application back while leaving additive schema in place. If a database defect is discovered, ship a forward-only corrective migration. Existing snapshots, findings, and audit or review history must remain intact.

## Known limits

- Microsoft client-secret auth is implemented; certificate or workload identity is still preferred future hardening.
- Provider token caches and rate limiting are process-local, not distributed.
- Google does not expose purchased entitlement totals through the selected APIs. A dedicated reviewed-entitlement editor is not included.
- Automated fixtures do not prove real provider consent, tenant policy, OAuth verification, API quotas, or production scheduler configuration.
- The migration has static and generated-type checks in CI. A real database migration should still be exercised in staging before production.
