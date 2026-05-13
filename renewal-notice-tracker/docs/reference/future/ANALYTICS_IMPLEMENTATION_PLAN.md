# Analytics Implementation Plan

Engineering rollout plan for Renewal / Notice Date Tracker analytics.

## Tracking priorities now

- core activation path
- core commercial path
- reliability-critical workflow events
- support time per organization
- onboarding time per organization

## Tracking priorities next

- account-health signal events and snapshots
- extraction and notification cost attribution
- workflow-view retention signals
- service delivery logs
- source-to-margin attribution

## Tracking priorities later

- deeper document-type extraction analysis
- provider/model quality comparisons
- more advanced anomaly detection

## Server-side tracking

- billing and plan changes
- imports
- review completion
- owner assignments
- reminder outcomes
- renewal decisions
- extraction outcomes
- admin rescue actions

## Client-side tracking

- pricing page views
- upgrade prompt views and clicks
- commercial gate views and clicks
- workflow-view revisits
- onboarding checklist interactions

## Derived from database state

- active tracked contract counts
- reviewed-contract rate
- owner-assignment rate
- reminder-coverage rate
- health score
- margin-risk rate

## Event-based only

- pricing funnel
- checkout funnel
- upgrade conversion
- gate conversion
- time to first value
- time to paid

## Storage recommendations

- `analytics_events`
- `organization_health_snapshots`
- `organization_profitability_snapshots`
- `support_time_logs`
- `onboarding_time_logs`
- `cost_usage_logs`

## QA priorities

- unit test metric and snapshot logic
- route/action tests for server-side events
- staging smoke test for signup to paid path
- duplicate/idempotency testing for retries and webhooks

## Governance

- no workflow ships without an analytics decision
- canonical event naming and versioning required
- server-side events are source of truth for critical flows
- support and onboarding effort must be logged against organization_id
