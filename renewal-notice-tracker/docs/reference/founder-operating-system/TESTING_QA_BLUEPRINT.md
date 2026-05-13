# Testing and QA Blueprint

## Current state

- Stronger unit and integration coverage than average for an early SaaS app
- Billing, entitlements, imports, exports, reminder logic, and many strategy modules already have tests
- End-to-end coverage is effectively missing
- Release confidence is weaker than the suite count suggests because a reminder-route test is flaky and trust-sensitive flows still lack browser-level coverage

## Highest-risk flows

- reminder generation, dispatch, retry, and duplicate suppression
- extraction plus human review correctness
- billing checkout, entitlements, and plan transitions
- spreadsheet import and export correctness
- permissions and tenant isolation

## Top missing tests

- signup to first-value e2e
- cross-tenant export denial
- reminder retry idempotency
- review regenerates reminders correctly
- import partial-failure regression
- downgrade entitlement regression
- admin rescue authorization
- ICS trusted-date correctness
- Growth escalation flow
- analytics critical-event smoke test

## Release gates

- typecheck must pass
- P0 unit/integration tests must pass
- no unresolved flaky P0 tests
- trust-sensitive changed areas must update tests
- staging smoke validation for reminders, billing, imports, permissions

## QA rule

Do not optimize for raw test count.
Optimize for user trust, money safety, and operational correctness.
