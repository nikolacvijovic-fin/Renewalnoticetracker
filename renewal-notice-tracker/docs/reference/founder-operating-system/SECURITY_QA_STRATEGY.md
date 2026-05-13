# Security QA Strategy

## Scope
Focused security and permissions test plan for:
- auth abuse scenarios
- role boundaries
- cross-org access attempts
- export abuse
- billing abuse
- admin route abuse
- internal health route access
- cron secret misuse
- webhook replay and validation
- file upload abuse
- data leakage through UI
- audit log visibility correctness

## Release principle
Anything that enables cross-org access, unauthorized privileged action, secret-protected endpoint bypass, or sensitive data leakage should block release.

## Highest-priority automated coverage
- Auth abuse denial and suspicious-event logging
- Role and org-boundary enforcement on server actions and routes
- Export, billing, and admin-route authorization failures
- Webhook validation and replay/idempotency safety
- Cron secret validation for reminder and digest routes

## Highest-priority manual QA
- Stale session and copied-link abuse attempts
- Customer-visible UI leakage checks
- Admin/debug visibility and redaction checks
- Upload failure handling for unsafe or malformed files

## Execution model
- Prefer automated coverage for deterministic denial paths and secret validation.
- Use manual QA for visibility, leakage, and operator-facing misuse scenarios.
- Treat P0 failures as release blockers.
