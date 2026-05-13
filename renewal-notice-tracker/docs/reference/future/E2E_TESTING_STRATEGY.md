# E2E Testing Strategy

This document captures the end-to-end test suite blueprint for Renewal / Notice Date Tracker.

## Core Principle

E2E tests should prove the product works the way a real user and a real admin experience it:

- auth and onboarding
- contract intake and review
- reminders and workflow updates
- imports and exports
- pricing and upgrade path
- billing unlocks
- admin rescue paths
- role restrictions

## Priority Order

- `P0`: auth, onboarding, upload/review, bulk import, reminder creation, export, checkout/upgrade, admin debug, role restrictions
- `P1`: manual contract, owner/status updates, reminder rules/escalations, pricing page path, digest, filtering/detail, decisions/notes
- `P2`: playbook attachment and completion

## Release Philosophy

- `P0` journeys should be the release-blocking E2E suite.
- `P1` journeys should run on release candidates and nightly.
- `P2` journeys can run nightly until workflow depth becomes more revenue-critical.
