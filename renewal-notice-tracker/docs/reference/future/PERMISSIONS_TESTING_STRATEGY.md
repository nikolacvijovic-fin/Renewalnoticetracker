# Permissions, Authorization, and Tenant-Isolation Testing Strategy

This document captures the security-minded QA plan for Renewal / Notice Date Tracker.

## Focus

- org membership boundaries
- owner/admin/member role behavior
- cross-org contract access
- cross-org exports
- billing routes
- admin routes
- reminder reruns and resends
- settings and org-level integrations
- import/export history
- hidden UI vs real protection
- route-level protection vs action-level protection

## Core Rule

Sensitive actions must be protected in the backend even if the UI already hides or disables them.

## Release Philosophy

- `P0`: anything involving cross-tenant data, billing, admin/debug tools, org-wide settings, or direct action invocation
- `P1`: historical operational metadata and lower-power visibility surfaces
- `P2`: only truly low-risk presentation-level permission nuances
