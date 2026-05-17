# Procurement Analytics Scope

This future layer is for read-only procurement analytics based on trusted vendor workflow state.

Allowed future direction:

- vendor rollup readiness
- department-level renewal exposure summaries
- procurement reporting from reviewed counterparties and trusted renewal cycles

Not allowed:

- turning NoticeControl into a supplier directory or CRM
- mutating counterparty truth through analytics output
- creating reminder rules, reminder activation, or decision automation

Activation requirement:

- analytics must read normalized vendor identity plus trusted workflow state
- every insight must remain downstream of the reviewed renewal-control loop
