# Subscription Usage Production Repair Runbook

## Deployment order

1. Back up the database and record the current migration head.
2. Deploy migration `202608180001_subscription_usage_production_repair.sql` after `202608170002_google_workspace_overlap_optimization.sql`.
3. Deploy migration `202608180002_subscription_usage_lifecycle_stabilization.sql` after `202608180001_subscription_usage_production_repair.sql`.
4. Deploy the Next.js application, Python intelligence service, and Java connector from the same revision.
5. Configure provider and internal secrets, then invoke `POST /api/cron/subscription-usage-sync` daily with `x-cron-secret: <CRON_SHARED_SECRET>` from the approved scheduler.
6. Reconnect existing provider connections so verified permissions are populated. Until then, scheduled Google synchronization fails closed with `permission_error`.
7. Validate one non-production Microsoft tenant and one non-production Google Workspace tenant before customer access.

Required runtime configuration:

- `MICROSOFT_365_CLIENT_ID`, `MICROSOFT_365_CLIENT_SECRET`, `MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI`
- `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET`, `GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI`, `GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY`
- `ADD_ON_INTERNAL_SIGNING_SECRET`, `CRON_SHARED_SECRET`
- `JAVA_ENTERPRISE_CONNECTORS_URL`, `PYTHON_INTELLIGENCE_URL`
- Supabase URL, anon key, and service-role key already required by the application

## Runtime behavior

The scheduler claims only due `connected` connections through a service-only `FOR UPDATE SKIP LOCKED` function. Claims expire, abandoned scheduled runs are marked failed, per-process provider requests are rate-limited, concurrency is bounded, and one organization's failure does not stop other claimed work. Success schedules the next daily run; recoverable provider failures use backoff; revoked, expired, permission, tenant, and verification failures stop future scheduling.

Each reconciliation records an immutable snapshot set. It contains the current provider batch and at most the latest successful snapshot from each other connected provider. Manual imports are excluded unless the current analysis is explicitly manual. Queries are organization- and batch-scoped, deterministic, paged, and fail rather than silently truncate above 10,000 rows.

Finding persistence runs in one database transaction. Usage-row, batch, sync-run, and analysis-scope identifiers are provenance only. Repeated material evidence is associated with the new analysis scope without reopening accepted, rejected, deferred, or action-planned decisions. Changed decision evidence creates a linked review-required revision that records the prior review state. Empty results resolve only active findings in the same scope family.

Manual synchronization uses one logical UTC-day interval with append-only attempt records. Processing, completed, and partial attempts are idempotent. Failed attempts require an explicit retry, observe bounded backoff, and stop after three attempts. Provider disconnect is transactional: it deletes the provider credential, clears scheduling and claims, and resolves only active findings whose direct connection or immutable analysis scope involved that provider.

## Real-provider verification

Automated fixtures and the disposable database test do not prove provider tenant policy, consent-screen behavior, live API quotas, or production scheduler and network configuration. Do not mark provider verification complete without recording sanitized outcomes from non-production tenants.

Microsoft checklist:

- Complete administrator consent and confirm the pending nonce is single-use.
- Acquire a tenant-specific token and confirm tenant, Graph audience, application ID, issuer, time, and role validation.
- Confirm the minimal Graph verification call, license sync, 30/90-day usage sync, token refresh, missing-permission failure, disconnect, and reconnection.
- Prefer certificate or workload-identity authentication before broad production rollout. Client-secret authentication is retained only for controlled beta deployment.

Google checklist:

- Complete administrator OAuth and confirm the exact granted scopes.
- Confirm Licensing and Reports synchronization, encrypted refresh-token reuse, revoked-access failure, disconnect, and reconnection.
- Confirm the connector issues only allowlisted GET requests despite Google's read/write Licensing scope.

Record only provider, safe tenant/customer reference, status, aggregate counts, warning/error codes, and timestamps. Never record tokens, account identities, authorization codes, provider payloads, or raw reports.

## Rollback and forward fix

This is an additive migration. Do not drop the new consent, scope, or association tables and do not remove finding revision columns after data exists. To stop the feature safely, disable the scheduler, disconnect provider connections, and roll the application back while leaving additive schema in place. If a database defect is discovered, ship a forward-only corrective migration. Existing snapshots, findings, and audit or review history must remain intact.

## Known limits

- Microsoft client-secret auth is implemented; certificate or workload identity is still preferred future hardening.
- Provider token caches and rate limiting are process-local, not distributed.
- Google does not expose purchased entitlement totals through the selected APIs. A dedicated reviewed-entitlement editor is not included.
- Automated fixtures do not prove real provider consent, tenant policy, OAuth verification, API quotas, or production scheduler configuration.
- CI applies migrations to a disposable local Supabase stack and executes RPC lifecycle tests. Staging migration and rollback rehearsal are still required before production.
