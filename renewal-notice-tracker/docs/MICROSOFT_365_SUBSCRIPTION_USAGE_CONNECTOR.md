# Microsoft 365 Subscription Usage Connector

## Runtime boundary

The Microsoft 365 connector is a human-review input to Subscription Usage Optimization. It reads aggregate license entitlements and aggregate usage-report counts. It does not remove licenses, cancel subscriptions, contact vendors, or turn findings into automatic actions.

Admin consent is not treated as proof of a connection. NoticeControl signs a 15-minute state value, persists a hash of its nonce, binds it to the current organization and actor, and consumes it once. After the callback, the server obtains a tenant-specific application token from `/{tenant}/oauth2/v2.0/token` with the Graph `.default` scope, verifies the token tenant and application roles, and calls a minimal Graph endpoint. The connection becomes `connected` only after verification succeeds.

## Provider setup

Configure a Microsoft Entra application with application permissions:

- `LicenseAssignment.Read.All`
- `Reports.Read.All`

Grant tenant-wide administrator consent and register the exact callback URL configured in `MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI`. Configure:

- `MICROSOFT_365_CLIENT_ID`
- `MICROSOFT_365_CLIENT_SECRET`
- `MICROSOFT_365_ADMIN_CONSENT_REDIRECT_URI`
- `ADD_ON_INTERNAL_SIGNING_SECRET`
- `JAVA_ENTERPRISE_CONNECTORS_URL`
- `PYTHON_INTELLIGENCE_URL`

The current credential implementation supports a securely injected client secret. Production should rotate it through the deployment secret manager. Certificate or workload-identity authentication remains the preferred follow-up and is not implemented in this repair.

Short-lived Graph access tokens are never stored in the database. They are cached in process memory per tenant, client, and credential fingerprint only until their real expiry, with a two-minute refresh margin. Tokens, authorization headers, Graph response bodies, user identities, and raw reports are forbidden from audit, operational, and customer-visible records.

## Accuracy and disconnect

The Java connector parses Microsoft CSV with Apache Commons CSV, enforces response and row limits, and maps SKU part numbers and report names through `microsoft-sku-mapping.v1.json`. Missing, stale, partial, unmapped, or contradictory activity evidence is a blocking warning; it cannot produce a terminate or high-confidence seat-reduction recommendation.

Disconnecting stops future synchronization and preserves prior snapshots, findings, and review history under existing retention controls. Disconnect does not revoke consent inside the customer's tenant. An Entra administrator must also open **Enterprise applications**, select the NoticeControl application, and remove or revoke its tenant consent when access must be fully removed.

## Verification

Before customer enablement, use a non-production Microsoft tenant to verify administrator consent, required roles, token refresh, consent replay rejection, cross-organization rejection, permission removal, credential rotation, disconnect, scheduled synchronization, throttling, and malformed or partial report behavior. Automated tests use fixtures and cannot prove the real tenant configuration.
