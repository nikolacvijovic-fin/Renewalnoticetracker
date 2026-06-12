## Shipped First Scope

NoticeControl ships first as a vendor-side renewal and notice control product.

Customer-visible scope:
- manual contract upload
- fixed CSV/XLSX template import
- vendor-side primary workflow
- P0 fields only: notice deadline, renewal date, expiration date, termination window, auto-renewal flag
- fast review for clean P0 fields
- exception review for conflicts, weak evidence, and derived dates
- owner assignment before trusted reminders
- email reminders and an in-app due-soon queue
- per-contract ICS export
- acknowledgment for high-risk reminders
- decision statuses and one active renewal cycle behavior
- import jobs may complete with partial success and a downloadable row-level error report
- critical audit logging
- early reporting only: reviewed coverage, owner coverage, due-soon exposure, decision gaps
- counterparty normalization v1
- Paddle primary billing with manual invoice exceptions
- Paddle is the only shipped-first self-serve billing provider
- trust-sensitive extract/reminder previews require authenticated org-scoped access
- shipped runtime uses one explicit active-organization model everywhere
- CSV/XLSX are classified paid structured exports, while per-contract ICS export is baseline shipped-first behavior
- services page trimmed to onboarding, import cleanup, and renewal-ops setup

Canonical source in code:
- [lib/product/shipping-profile.ts](lib/product/shipping-profile.ts)
- [lib/product/deferred-capabilities.ts](lib/product/deferred-capabilities.ts)

Boundary rule:
- shipped-first runtime must not import deferred capabilities
- deferred capabilities may survive only as dormant modules, reference material, or migration-only code
