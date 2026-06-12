# Tenant Isolation Hardening

This document is the paranoid tenant-isolation hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- [lib/commercial/tenant-isolation-hardening.ts](../../../lib/commercial/tenant-isolation-hardening.ts)

It covers:
- tenant boundary model
- org scoping rules
- object lookup safety rules
- dangerous query patterns
- RLS and backend enforcement recommendations
- audit checks for tenant-crossing attempts
- concrete test cases to prove isolation
- highest-risk tenant-isolation gaps
- best implementation approach

Blunt stance:
- `organization_id` is the real security boundary.
- Raw-id lookup on tenant-bound objects is hostile until proven safe.
- Service-role code is where otherwise good multi-tenant systems quietly fail.
- Exports, rescue actions, settings, billing, debug data, and history views are all exfiltration surfaces.
