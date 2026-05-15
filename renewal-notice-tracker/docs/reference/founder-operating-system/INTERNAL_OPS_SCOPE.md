# Internal Ops Scope

`/internal/ops` is a minimal internal rescue console for the shipped-first NoticeControl product.

Allowed runtime content:
- reminder processing status
- failed reminders and retry state
- notification delivery failures
- extraction failures
- import failures and partial-success diagnostics
- billing exceptions affecting real customer access
- export, deletion, backup, and restore traces tied to real runtime support
- audit-safe rescue actions already implemented in code
- rescue snapshot refreshes that return only operational counts, never readiness or capacity scores

This runtime UI is intentionally not a strategy dashboard, analytics blueprint, packaging console, or profitability cockpit.
