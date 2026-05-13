# Future Event Taxonomy

These analytics events are preserved for later capability work and must not leak into shipped Phase 1 runtime:

- `digest_sent`
- `escalation_rule_created`
- `playbook_applied`
- `account_inactivity_flagged`
- `health_score_snapshot`
- `profitability_snapshot`
- `customer_success_intervention`
- Slack and Teams delivery events
- native calendar sync events

Canonical future event source:

- [lib/analytics/future-events.ts](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/lib/analytics/future-events.ts:1)
