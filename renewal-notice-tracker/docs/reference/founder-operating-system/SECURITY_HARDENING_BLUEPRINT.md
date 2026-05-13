# Security Hardening Blueprint

This document is the execution-ready security, permissions, privacy, and compliance hardening plan for Renewal / Notice Date Tracker.

Canonical source:
- `C:\Users\Lenovo\Documents\Playground\renewal-notice-tracker\lib\commercial\security-hardening.ts`

It covers:
- current auth, role, tenant, billing, audit, and privacy posture
- security maturity scoring
- full risk map across auth, authorization, tenant isolation, admin/internal routes, billing, webhooks, cron, files, extraction trust, auditability, privacy, secrets, abuse, and compliance risk
- prioritized hardening recommendations with severity and release-blocker flags
- policy and control design for roles, permissions, object access, org boundaries, audit logs, internal routes, webhook validation, cron auth, secrets, and privacy/retention
- pragmatic SMB and lower mid-market compliance readiness
- final top risks, top fixes, release blockers, permission model, roadmap, and strategic warning

Blunt operating stance:
- RLS is a strength, but service-role convenience can quietly erase it.
- Route-level guards are not enough; privileged actions must verify object ownership inside the action path.
- Billing, reminder rescue, internal routes, and extraction trust are all customer-trust surfaces.
- Privacy posture is not credible without retention and deletion rules for contract files, extracted text, and evidence.
- Security should stay narrow and practical: protect tenant isolation, privileged operations, and trust-sensitive workflow integrity before adding more surface area.
