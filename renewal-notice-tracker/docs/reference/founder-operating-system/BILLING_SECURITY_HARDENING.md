# Billing Security Hardening

This document is the billing, entitlements, and commercial security hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- [lib/commercial/billing-security-hardening.ts](../../../lib/commercial/billing-security-hardening.ts)

It covers:
- risk map
- billing abuse scenarios
- entitlement bypass scenarios
- webhook risks
- webhook idempotency requirements
- hardening recommendations
- tests needed
- release blockers
- best implementation approach

Blunt stance:
- Billing routes are privileged org-admin surfaces.
- Webhooks are machine-authenticated admin actions and must be idempotent.
- Entitlements are backend authorization, not UI copy.
- Downgrade and payment-state drift are where “mostly secure” billing systems quietly fail.
