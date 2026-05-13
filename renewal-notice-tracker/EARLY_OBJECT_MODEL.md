## Early Object Model

Customer-facing early product truth is intentionally small:
- `Contract`
- `ContractVersion`
- `RenewalCycle`
- `Reminder`
- `Decision`
- `AuditEvent`

Behavioral rules:
- one active renewal cycle per contract in early customer behavior
- renewal cycle workflow state is persisted separately from decision truth
- high-risk acknowledgment updates the cycle state but does not count as a decision
- reviewed contract metadata is the source of truth for reminders
- decisions do not duplicate separate closure truth in the customer workflow
- no first-class customer-facing obligation/action-basis layer in early flows
