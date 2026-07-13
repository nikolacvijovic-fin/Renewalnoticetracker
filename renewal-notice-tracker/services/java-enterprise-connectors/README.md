# Java Enterprise Connectors

Optional enterprise connector boundary for future large-customer integrations.

Current state: interface and health scaffold only. This service does not ship Coupa, SAP Ariba, Oracle, ServiceNow, Workday, NetSuite, SCIM, or SAML adapters yet.

## Run

```bash
mvn test
mvn spring-boot:run
```

## Boundary

- Owns future enterprise connector interfaces.
- Does not own NoticeControl UI, auth, billing, or contract workflow truth.
- Must not log provider secrets, tokens, assertions, or raw provider payloads.
