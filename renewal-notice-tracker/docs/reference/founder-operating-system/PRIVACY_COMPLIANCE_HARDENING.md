# Privacy and Compliance Hardening

This document is the pragmatic privacy and compliance hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- [lib/commercial/privacy-compliance-hardening.ts](../../../lib/commercial/privacy-compliance-hardening.ts)

It covers:
- data categories
- retention policy
- deletion policy
- immutable audit policy
- customer-facing controls
- documentation readiness
- vendor and subprocessor considerations
- GDPR-style practical expectations
- claims that should not be made yet
- best implementation approach

Blunt stance:
- This product can be privacy-credible without pretending to be enterprise-perfect.
- Contracts, extracted text, reminders, notes, notification logs, and audit trails all need separate lifecycle rules.
- The biggest compliance risk is overclaiming maturity that the operating model does not yet support.
