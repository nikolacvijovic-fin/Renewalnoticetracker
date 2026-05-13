# Authorization Hardening Strategy

This document is the RBAC and authorization hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- `C:\Users\Lenovo\Documents\Playground\renewal-notice-tracker\lib\commercial\authorization-hardening.ts`

It covers:
- critique of the current likely owner/admin/member model
- corrected role model
- permission matrix
- object-level access rules
- route-level vs action-level protection rules
- hidden UI vs real authorization rules
- default-deny model
- privileged escalation path
- audit requirements for sensitive actions
- highest-risk authorization gaps
- best implementation approach

Blunt authorization stance:
- A small role model is good.
- Route protection is not enough.
- Exports, billing, settings, rescue actions, and debug tools are high-trust surfaces.
- Service-role convenience is the main way a good RBAC story quietly fails in practice.
