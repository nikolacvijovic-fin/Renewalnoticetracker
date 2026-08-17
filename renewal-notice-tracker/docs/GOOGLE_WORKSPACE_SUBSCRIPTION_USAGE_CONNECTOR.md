# Google Workspace Subscription Usage Connector

## Product Boundary

The Google Workspace connector is part of the Growth-gated Subscription Usage Optimization add-on. It imports aggregate SKU assignment and account-activity evidence, matches that evidence to contracts within the active NoticeControl organization, and creates human-review recommendations. It does not cancel subscriptions, remove licenses, contact vendors, or treat functional overlap as proven duplication.

## Administrator Setup

1. Create a Google OAuth web client for the NoticeControl deployment.
2. Register `GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI` exactly as an authorized redirect URI.
3. Enable the Enterprise License Manager API and Admin SDK Reports API in the Google Cloud project.
4. Configure the environment variables below and deploy the Next.js and Java add-on services.
5. An organization owner, admin, or operator enters the Google customer ID and primary domain, then completes Google administrator consent.

Required environment variables:

- `GOOGLE_WORKSPACE_CLIENT_ID`
- `GOOGLE_WORKSPACE_CLIENT_SECRET`
- `GOOGLE_WORKSPACE_OAUTH_REDIRECT_URI`
- `GOOGLE_WORKSPACE_CREDENTIAL_ENCRYPTION_KEY` with at least 32 characters
- `ADD_ON_INTERNAL_SIGNING_SECRET`
- `JAVA_ENTERPRISE_CONNECTORS_URL`
- `PYTHON_INTELLIGENCE_URL`

## Requested Permissions

- `https://www.googleapis.com/auth/apps.licensing`: reads Google Workspace SKU assignments. Google exposes no read-only Licensing API scope; the connector performs GET operations only.
- `https://www.googleapis.com/auth/admin.reports.usage.readonly`: reads last-login usage evidence used to calculate aggregate 30-day and 90-day active counts.

Directory scope is not requested. The current connector does not need names, profiles, groups, aliases, or other directory records. Google administrator authorization and API access remain subject to the customer's Google Workspace configuration.

Official references:

- [Google OAuth 2.0 for web server applications](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Enterprise License Manager API](https://developers.google.com/workspace/admin/licensing/reference/rest/v1/licenseAssignments)
- [Admin SDK user usage report](https://developers.google.com/workspace/admin/reports/reference/rest/v1/userUsageReport/get)

## Credential and Privacy Handling

The authorization callback exchanges the one-time code server-side. The refresh credential is encrypted with AES-256-GCM and stored in `subscription_usage_provider_credentials`, a service-role-only table with no `anon` or `authenticated` access. Customer-visible connection records contain only a managed reference and fingerprint.

For synchronization, TypeScript decrypts the refresh credential server-side, obtains a short-lived access token, and sends it to Java only inside the signed internal request. Java aggregates identifiers in memory and returns product-level counts. Access tokens, refresh credentials, authorization codes, identities, raw reports, and provider payloads are forbidden from database records, audit metadata, logs, and UI.

Disconnect immediately deletes the encrypted credential and clears the next scheduled synchronization. Aggregate snapshots, contract matches, findings, and review history remain subject to the organization's existing retention and workspace-deletion controls.

## Synchronization and Evidence

Manual synchronization is idempotent per organization, connection, and UTC day. A successful run creates an atomic import batch, normalized rows, contract matches, and reviewable findings. A failed run records only a safe error code and leaves the last successful snapshot intact.

Google's Licensing API returns assigned users but not purchased-seat entitlement totals. The connector therefore labels `purchased_seats_unavailable_using_assigned_count` and uses assigned count as the denominator. Account last login is an adoption proxy, not product-feature telemetry, and is labeled `activity_uses_account_login_proxy`. These limitations reduce overlap confidence. Missing activity produces a partial snapshot and cannot produce high-confidence overlap.

Cross-provider mappings are loaded from `config/subscription-capability-taxonomy.v1.json`. Savings use reviewed contract cost only, remain separated by currency, and are presented as a range. Every overlap defaults to `investigate`, requires human review, and is never proof of equivalence.

## Status and Troubleshooting

- `connected`: authorization exists and synchronization may run.
- `permission_error`: Google rejected the required API operation; verify administrator consent and API enablement.
- `revoked_access`: the refresh credential was revoked; reconnect the provider.
- `expired_credential`: the encrypted credential is absent or unusable; reconnect the provider.
- `disconnected`: no further synchronization is allowed and the encrypted credential has been removed.

Safe synchronization evidence includes provider, customer/domain, duration, aggregate row count, retry count, status, freshness, and warning/error codes. It excludes user identities and raw provider content.

## Deployment Verification

Run the Node connector tests, Python reconciliation tests, and Java connector tests. Verify connect, sync, reconnect, revoked access, permission failure, disconnect, repeated same-day sync, cross-provider contract linking, feedback controls, and retention behavior in a non-production Google Workspace test organization before enabling customer access.
