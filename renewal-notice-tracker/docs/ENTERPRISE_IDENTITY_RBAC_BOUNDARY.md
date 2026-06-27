# Enterprise Identity / RBAC Boundary

Canonical code sources: `lib/product/enterprise-rbac.ts` and `lib/product/enterprise-identity.ts`.

Future schema and route contracts are defined in `lib/product/enterprise-identity-schema.ts`, `lib/product/enterprise-identity-routes.ts`, and [enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md).

The current runtime bridge for future implementation lives in `lib/product/enterprise-identity-runtime.ts`. It centralizes Enterprise-plan/admin gating, SCIM lifecycle normalization, deprovisioned-user access blocking, group-role mapping safety, and safe audit metadata shaping without exposing live SSO or SCIM routes.

NoticeControl currently ships a focused role model for renewal-control operations. Enterprise SSO, SCIM, granular permission groups, retention controls, and delegated administration are intentionally deferred behind the `enterprise_identity_rbac_retention` platform module in [PLATFORM_MODULE_REGISTRY.md](PLATFORM_MODULE_REGISTRY.md).

SSO, SCIM, permission groups, retention controls, and delegated enterprise administration are deferred until a future enterprise release gate.

The future implementation lifecycle, audit-event contract, schema/route contract, and packaging gate are defined in [enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md](enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md) and [enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md). Future customer/admin documentation scaffolding lives in [enterprise/ENTERPRISE_ADMIN_IDENTITY_GUIDE.md](enterprise/ENTERPRISE_ADMIN_IDENTITY_GUIDE.md).

## Current Shipped Roles

| Role | Status | Runtime surface | What it can do today | What it must not do |
| --- | --- | --- | --- | --- |
| `admin` | shipped | customer app | Upload/import, P0 review, owner assignment, reminders, decisions, exports, financial/procurement intelligence, billing/settings | Owner-only workspace deletion, internal rescue, future enterprise settings |
| `operator` | shipped | customer app | Intake, review, owner assignment, reminders, decisions, operational exports, procurement/risk access | Billing/settings authority, financial intelligence, workspace deletion, internal rescue |
| `reviewer` | shipped | customer app | P0 review, owner assignment, extraction/reminder preview, basic/rich review exports, risk access | Business decisions, billing/settings, financial/procurement dashboards, workspace deletion |
| `owner` | shipped | customer app | Acknowledge, decide, close/reopen, basic export, owner-scoped risk access, billing/settings, deletion request | Review/trust edits, owner assignment, rich sensitive exports, internal rescue |
| `internal_support` | shipped | internal only | Bounded audited internal operations and rescue paths | Customer runtime actions and future enterprise administration |
| `internal_admin` | shipped | internal only | Bounded audited internal operations and destructive control-plane execution where separately authorized | Customer runtime actions and future enterprise administration |
| `member` | legacy alias | none | Normalizes to `operator` for legacy data compatibility | Appearing as a new runtime role |

There is no shipped `viewer` role. Read-only enterprise access is future-only until a real enterprise identity gate exists.

## Future Enterprise Roles

Future roles are registered so product and authorization work has stable names, but they grant no shipped product access today.

| Role | Status | Intended future ownership |
| --- | --- | --- |
| `viewer` | future | Read-only enterprise visibility after scoped viewer semantics are defined |
| `security_admin` | future | SSO, SCIM, permission groups, security policy |
| `billing_admin` | future | Dedicated billing administration without broad workspace admin authority |
| `compliance_admin` | future | Retention, deletion evidence, legal/compliance operations |
| `integration_admin` | future | Future provider integrations and API credentials |
| `report_admin` | future | Future reporting governance and sensitive export administration |
| `support_admin_delegate` | future | Customer-approved delegated support/admin flows |
| `finance_viewer` | future | Read-only financial intelligence access |
| `legal_validator` | future | Read-only risk/evidence validation access |

These roles must not appear in customer navigation, active authorization checks, route handlers, or action buttons until their release gate moves from future/deferred to shipped.

## Sensitive Action Registry

Every sensitive action must be represented in the central RBAC registry before it is used in runtime code.

| Action | Current boundary |
| --- | --- |
| `contract_upload_import` | Active organization, shipped upload/import roles, Starter/manual-contract gate |
| `contract_review_trust_change` | Active organization, review-capable roles |
| `contract_p0_edit` | Active organization, review-capable roles |
| `owner_assignment` | Active organization, review/workflow roles |
| `extraction_preview` | Active organization, review-lane roles, OCR privacy boundary |
| `reminder_preview` | Active organization, review/workflow roles |
| `reminder_creation_control` | Active organization, review/workflow roles |
| `reminder_dispatch_internal` | Internal role plus internal route secret |
| `reminder_acknowledgment` | Active organization, accountable admin/operator/owner lane |
| `renewal_decision` | Active organization, accountable admin/operator/owner lane |
| `cycle_close_reopen` | Active organization, accountable admin/operator/owner lane |
| `export_basic` | Active organization, export feature gate, no notes/intelligence/audit payloads |
| `export_sensitive_rich_presets` | Active organization, export preset policy, paid gate, role-specific sensitive sections |
| `export_ics` | Active organization, per-contract baseline export |
| `intelligence_risk_explanation_access` | Active organization, intelligence permission, billing gate, owner scope where relevant |
| `financial_intelligence_access` | Active organization, financial intelligence gate, admin-only until future finance role ships |
| `procurement_analytics_access` | Active organization, procurement analytics gate, admin/operator |
| `billing_settings_manage_checkout` | Active organization, admin/owner billing authority |
| `org_settings_manage` | Active organization, admin/owner organization authority |
| `internal_operations` | Internal role plus separated internal route secrets |
| `workspace_deletion` | Owner request plus destructive signed internal execution boundary |
| `future_sso_settings` | Deferred enterprise gate |
| `future_scim_provisioning` | Deferred enterprise gate |
| `future_permission_groups` | Deferred enterprise gate |
| `future_retention_settings` | Deferred enterprise gate |
| `future_integration_settings` | Deferred enterprise gate |
| `future_admin_delegation` | Deferred enterprise gate |

## Expansion Rules

- New shipped-sensitive actions must be added to `lib/product/enterprise-rbac.ts` with owner surfaces and test/release-gate evidence.
- New runtime authorization should continue to use the existing shipped action matrix, intelligence access helpers, billing entitlement helpers, internal route auth, or export preset policy as appropriate.
- Future Enterprise identity route/service work must use `lib/product/enterprise-identity-runtime.ts` for Enterprise/admin gating, provisioning state normalization, group-role mapping safety, and audit metadata sanitization before touching session, membership, or audit paths.
- Future enterprise roles must remain inert until a dedicated Enterprise release gate covers SSO/SCIM lifecycle, auditability, support operations, customer communication, and privacy/data-retention behavior.
- Billing, security, compliance, integration, report, and delegated-support roles must not silently inherit `admin` authority.
- Internal roles must never become customer roles; internal actions still require internal secrets and stronger destructive auth where applicable.

## Promotion Criteria For Real SSO / SCIM

Before SSO, SCIM, or granular permission groups can ship, the enterprise module must have:

- A concrete entitlement and packaging policy, likely Enterprise-only.
- A lifecycle model for login, invite, provisioning, deprovisioning, lockout/recovery, domain verification, metadata/certificate rotation, and fallback admin recovery.
- Runtime bridge coverage for Enterprise/admin gating, provisioned/deprovisioned member access state, SCIM create/update/delete normalization, group-role mapping anti-escalation, and safe identity audit inputs.
- Future schema and route contracts for SSO configuration, verified domains, SCIM users, group-role mappings, identity events, validation, idempotency, and safe audit/monitoring metadata.
- Provider-specific auth and provisioning lifecycle tests.
- Tenant-isolation, role-escalation, and deprovisioning tests.
- Audit events for role changes, group mappings, SSO configuration changes, and provisioning failures.
- Monitoring/runbooks for lockout, misconfiguration, and failed provisioning incidents.
- Customer-facing docs that explain current and future roles without implying full CLM or generic workflow scope.
