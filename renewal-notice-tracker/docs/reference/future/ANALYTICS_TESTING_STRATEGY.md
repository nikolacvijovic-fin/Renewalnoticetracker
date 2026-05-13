# Analytics Instrumentation Testing Strategy

This document captures the QA strategy for analytics instrumentation in Renewal / Notice Date Tracker.

## Focus

- key events fire correctly
- event properties are correct
- duplicate events are minimized
- client/server event boundaries are correct
- conversions are measurable
- retention signals are trustworthy
- revenue and commercial events are correct

## Event Domains

- auth events
- onboarding events
- contract creation events
- review events
- reminder events
- digest events
- export events
- commercial gate events
- checkout and billing events
- admin/reliability events
- inactivity/churn signals

## Analytics QA Rule

If the event cannot support an operational, product, or revenue decision, do not optimize for tracking it. If it can support a decision, test it like production logic.
