# Java Enterprise Connectors

Optional enterprise connector boundary for future large-customer integrations.

Current state: interface and health scaffold only. This service does not ship Coupa, SAP Ariba, Oracle, ServiceNow, Workday, NetSuite, SCIM, or SAML adapters yet.

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

- Implement a provider-specific connector behind an explicit enterprise gate.
- Add idempotent sync and provider retry behavior without logging raw payloads.

## Integration With TypeScript

The Next.js app calls this service only through `lib/add-ons/java-enterprise-client.ts`. Java remains optional and enterprise-only until a gated connector integration is actually shipped.

## Scaffolded vs Production-Ready

Current state: scaffolded. Production readiness requires provider-specific adapters, tenant-scoped persistence, audit contracts, idempotency, monitoring, and customer-specific enablement.

## Boundary

- Owns future enterprise connector interfaces.
- Does not own NoticeControl UI, auth, billing, or contract workflow truth.
- Must not log provider secrets, tokens, assertions, or raw provider payloads.
