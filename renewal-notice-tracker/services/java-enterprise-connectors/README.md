# Java Enterprise Connectors

Optional enterprise connector boundary for large-customer integrations.

Current state: health scaffold plus Microsoft 365 and Google Workspace subscription-usage inventory adapters. This service does not ship Coupa, SAP Ariba, Oracle, ServiceNow, Workday, NetSuite, Okta, SCIM, or SAML adapters yet.

## What This Teaches

- enterprise service boundaries
- typed connector interfaces
- provider adapter scaffolding
- HMAC/internal request verification
- optional enterprise integration packaging

## Product Subsystem

Java owns optional enterprise connector scaffolds for procurement, ERP, identity, and workflow systems. It is the right runtime for long-lived enterprise adapter code and provider-specific integration contracts.

Java does not own the renewal-control kernel, UI, billing, entitlements, contract workflow truth, or customer runtime navigation.

## Run

```bash
mvn test
mvn spring-boot:run
```

## Learning Tasks

Beginner:

- Run `mvn test`.
- Inspect the health endpoint and connector package layout.

Intermediate:

- Add a mocked procurement adapter contract.
- Add safe metadata validation for a connector request.

Advanced:

- Extend the provider usage adapters with additional mocked provider scenarios before production rollout.
- Add idempotent sync and provider retry behavior without logging raw payloads.

## Integration With TypeScript

The Next.js app calls this service only through `lib/add-ons/java-enterprise-client.ts`. Java remains optional and add-on-gated; TypeScript continues to own organization membership, billing/entitlement checks, persistence, audit, and review workflow.

## Scaffolded vs Production-Ready

Microsoft 365 and Google Workspace subscription usage are implemented behind the signed connector boundary. Production rollout still requires the service to be deployed and `JAVA_ENTERPRISE_CONNECTORS_URL` plus `ADD_ON_INTERNAL_SIGNING_SECRET` to be configured in the Next.js app. Microsoft uses tenant admin consent and a managed Graph credential reference. Google uses administrator OAuth; TypeScript refreshes a server-encrypted credential and sends only the short-lived access token over the signed internal request. Java never receives database authority or refresh credentials.

The adapters return normalized aggregate subscription inventory only. They must not log raw provider responses, access tokens, refresh tokens, authorization codes, user principal names, email addresses, or user activity detail rows.

## Boundary

- Owns future enterprise connector interfaces.
- Does not own NoticeControl UI, auth, billing, or contract workflow truth.
- Must not log provider secrets, tokens, assertions, or raw provider payloads.
