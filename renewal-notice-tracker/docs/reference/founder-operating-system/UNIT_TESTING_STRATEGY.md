# Unit Testing Strategy

This document captures the logic-first unit testing strategy for Renewal / Notice Date Tracker.

## Unit Test Domains

The canonical source of truth is in `lib/commercial/unit-testing-strategy.ts`.

- Validation schemas
- Reminder date generation
- Escalation generation
- Entitlement logic
- Dashboard metric calculations
- Import parsing/validation
- Export formatting/sanitization
- ICS generation
- Lifecycle/status transitions
- Digest summary generation
- Evidence row generation
- Business-impacting utilities
- Error mapping / safe-message logic

## Priority Order

- `P0`: trust, billing/commercial logic, contract-date behavior, import/export correctness, safe error handling
- `P1`: schema correctness, dashboard calculations, digest shaping, evidence shaping
- `P2`: lower-risk utilities not already covered transitively

## What Not To Unit Test

- Pure presentation markup without branching business logic
- Framework wiring better proven in integration or end-to-end tests
- Simple SDK pass-through wrappers without transformation logic
- Strategy-content modules whose value is structural rather than behavioral
- Full route behavior that depends on auth, DB, and providers together
