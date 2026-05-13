# Full Analytics Architecture

## Current State
- Already measurable: contracts, review backlog, reminder throughput/failures, import outcomes, extraction failures, billing state, and some commercial audit events.
- Already visible: admin/debug operational dashboard and strategy summaries.
- Missing: full activation funnel, cohort retention, trust-quality metrics, support cost by account, and founder-grade live KPI dashboards.
- Dangerous blind spot: the team can currently see ops failures better than adoption failures.

## North Star
- Active tracked contracts with reviewed dates, assigned owners, and live obligations surfaced in paying workspaces.

## Activation Definition
- One contract uploaded, reviewed, owner-assigned, reminder-enabled, and visible as a live obligation.

## KPI System
- Product: reviewed contract coverage, owner coverage, reminder adoption, decision coverage, time to trusted contract.
- Revenue: MRR, ARR, activation-to-paid, expansion MRR, annual mix, ACV by segment.
- Retention: weekly active workspaces, contract-count expansion, owner and decision coverage trends, health score distribution.
- Reliability: reminder success, import success, extraction failure rate, cron lag, mean time to recovery.
- Support/CS: support hours per account, onboarding burden, import cleanup burden, save-play outcomes, service attach rate.

## Event Taxonomy
- Auth: signup and login events with source attribution.
- Onboarding: checklist viewed and onboarding step completed.
- Contract workflow: contract created, upload started/completed, extraction completed/failed, review started/completed, owner assigned, reminder created/sent/failed, decision recorded.
- Commercial: pricing page viewed, upgrade prompt viewed/clicked, gate shown/clicked, checkout started/completed, plan changed/cancelled.
- Reliability: import failed, reminder failed, workflow error recorded, admin rerun actions.
- Churn: inactivity flagged and cancellation intent detected.

## Dashboards
- Founder: revenue, margin, retention, risk.
- Product: activation, trust, workflow depth.
- Growth: source-to-paid and upgrade performance.
- Customer success: health, churn risk, expansion.
- Support/operations: failures, recovery, burden.
- Reliability/trust: extraction quality, reminder reliability, review confidence.

## Implementation Priorities
- Now: instrument activation funnel, prompt/gate context, workflow lifecycle, and the first live dashboards.
- Next: add health scoring, support/onboarding cost measurement, trust-quality metrics, and services-to-expansion tracking.
- Later: cohort forecasting, margin by feature family, anomaly detection, and executive forecasting.

## Rules
- Use snake_case event names.
- Include `organization_id` on every possible event.
- Include `plan_tier` on commercial events.
- Use one canonical success event and one canonical failure event per action.
- Version schemas with `event_version`.
- Control enums like `source`, `prompt_context`, and `signal_type`.

## Top 10 Next Analytics Actions
1. Instrument the canonical activation events.
2. Add prompt-context and gate-context properties.
3. Track review correction and low-confidence extraction.
4. Add account inactivity and health-transition events.
5. Connect billing changes to behavior cohorts.
6. Track support and onboarding effort per account.
7. Publish founder, product, and support dashboards first.
8. Normalize event naming and versioning.
9. Ignore vanity traffic and raw signups without activation context.
10. Run decisions off activation depth, retention depth, and gross margin.
