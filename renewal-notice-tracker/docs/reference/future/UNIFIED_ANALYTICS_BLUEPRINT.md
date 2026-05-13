# Unified Analytics Blueprint

## Goal

One canonical analytics model for Renewal / Notice Date Tracker that aligns:

- product analytics
- revenue analytics
- retention analytics
- reliability analytics
- customer success analytics

This blueprint keeps all measurement tied to the wedge:

- renewal control
- notice periods
- reminders
- ownership
- visibility
- action

## 1. North star

- Active tracked contracts in paying workspaces where review is completed, an owner is assigned, and at least one live obligation is surfaced.

## 2. Activation model

- Activation = one contract uploaded or created, reviewed, owned, reminder-backed, and visible as a live obligation.
- First value comes before payment.
- First paid value comes when the account proves workflow value and hits natural commercial pressure.

## 3. Retention model

- Retained account = paying workspace that maintains or expands trusted coverage and keeps using the workflow.
- Active account = meaningful workflow action, not login.
- Churn risk = weak review, weak ownership, weak reminder continuity, decision gaps, stalled coverage, or reliability pain.

## 4. Event taxonomy

- auth
- onboarding
- contract creation
- upload
- extraction
- review
- ownership
- reminders
- rules and escalations
- playbooks
- decisions
- exports
- digest
- billing
- pricing
- upgrade prompts
- admin/debug
- errors/failures
- inactivity/churn signals

## 5. KPI hierarchy

- North star and activation
- workflow trust and embedding
- monetization and upgrades
- retention and account health
- reliability and trust
- contribution margin and segment economics

## 6. Dashboard system

- Founder / Executive
- Product
- Growth / Revenue
- Retention / Customer Success
- Support / Operations
- Reliability / Trust

## 7. Warning thresholds

- reminder delivery below 98 percent = warning
- reminder delivery below 95 percent = critical
- gross margin below 75 percent = warning
- gross margin below 65 percent = critical
- support cost above 15 percent of ACV = warning
- support cost above 25 percent of ACV = critical
- payback above 12 months = warning
- payback above 18 months = critical

## 8. Implementation order

1. activation path events
2. commercial path events
3. reliability-critical events
4. support/onboarding/cost logs
5. health and profitability snapshots
6. founder, product, and growth dashboards first

## 9. Data quality rules

- canonical event schema
- versioned events and metrics
- top-level common dimensions
- idempotency keys for retry-prone flows
- support and onboarding effort logged against organization_id
- no score trusted without source-signal coverage

## 10. Top 10 next actions

1. instrument signup to first value end to end
2. strengthen abandonment signals
3. complete support time logging
4. complete onboarding time logging
5. capture extraction cost by organization
6. capture notification cost by organization
7. build health snapshots
8. build profitability snapshots
9. remove metrics that do not change decisions
10. establish weekly operating reviews on the canonical dashboards
