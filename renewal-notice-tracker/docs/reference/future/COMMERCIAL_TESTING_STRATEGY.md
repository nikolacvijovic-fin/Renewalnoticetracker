# Commercial Testing Strategy

This document captures the billing, pricing, entitlement, and upgrade-path QA strategy for Renewal / Notice Date Tracker.

## Focus

- pricing page behavior
- checkout session creation
- invalid plan handling
- admin-only billing access
- payment webhook synchronization
- entitlement enforcement
- commercial denial flows
- export gating
- digest gating
- manual contract gating
- multi-recipient reminder gating
- billing portal behavior
- subscription status edge cases

## Commercial QA Rule

Any bug that leaks paid value, falsely blocks a paying customer, or corrupts subscription state is a release-risk bug, not a minor billing issue.

## Release Philosophy

Release blockers are the issues that can:

- lose revenue
- break upgrades
- grant unauthorized paid access
- deny legitimate paid access
- create billing/entitlement drift
