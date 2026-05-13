# Audit Integrity Hardening

This document is the audit-log and integrity hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- `C:\Users\Lenovo\Documents\Playground\renewal-notice-tracker\lib\commercial\audit-integrity-hardening.ts`

It covers:
- what must always be audited
- what details must be included
- tamper-resistance expectations
- privacy-safe audit design
- traceability expectations
- who may view which audit data
- retention expectations
- redaction rules
- best implementation approach

Blunt stance:
- Audit logs are an integrity control, not just a timeline widget.
- If reminders, reviews, billing changes, denials, or rescue actions happen without trustworthy audit trails, the product is harder to defend operationally.
- A useful audit log should explain the action without becoming a second copy of customer secrets or contract content.
