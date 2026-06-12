# Internal Tooling Hardening

This document is the admin/debug/internal-tooling hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- [lib/commercial/internal-tooling-hardening.ts](../../../lib/commercial/internal-tooling-hardening.ts)

It covers:
- risk map for `/dashboard/admin`, rescue actions, internal health, debug data, retry visibility, and secret-based tooling
- privilege rules
- secret management rules
- safe audit rules
- data that must never appear in admin UI
- tenant-breach prevention rules
- access-control buckets for owner/admin only, owner only, secret only, and both
- monitoring and alerting rules
- release blockers
- best implementation approach

Blunt stance:
- Internal tools are not “just support features.”
- Rescue actions are privileged mutation surfaces.
- Customer-admin tooling and true internal/operator tooling should not be casually mixed.
- Debug visibility without strict scoping is one of the fastest ways to create a tenant-isolation breach.
