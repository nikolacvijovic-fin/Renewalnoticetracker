# Integration Testing Strategy

This document captures the backend integration testing plan for Renewal / Notice Date Tracker.

## Focus

Integration tests should cover the seams where multiple systems interact and trust can break:

- auth and Supabase session handling
- contract creation and persistence
- upload/storage/extraction pipeline
- review updates and reminder regeneration
- billing and entitlements
- imports and job tracking
- digest send flows
- reminder cron processing
- retry and duplicate suppression
- exports
- settings persistence
- org/membership/role behavior

## Priorities

- `P0`: review/reminder regeneration, billing/entitlements, imports/job tracking, reminder cron, retry/duplicate suppression, tenant-safe role behavior
- `P1`: auth/session handling, upload/extraction pipeline, exports, settings persistence, digest sends
- `P2`: contract creation paths already substantially covered through other tests

## Test Philosophy

- Keep database-shaping logic, actions, routes, and entitlement checks real.
- Mock external billing providers, chat/email providers, storage adapters, and extraction providers.
- Use integration tests to prove persistence, trust-sensitive transitions, and commercial denials.
- Leave pure logic to unit tests and full user journeys to end-to-end tests.
