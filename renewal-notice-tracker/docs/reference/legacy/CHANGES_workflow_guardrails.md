# Workflow Guardrail Changes

- Reminder automation is now explicitly blocked for contracts still in `needs_review`.
- Due-soon contracts that still need review or lack an owner now surface as runtime health blockers.
- Stale review backlog is now visible as an operator warning instead of staying implicit.
