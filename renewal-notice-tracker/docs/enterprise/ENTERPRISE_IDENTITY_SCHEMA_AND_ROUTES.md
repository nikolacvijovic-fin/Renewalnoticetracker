# Enterprise Identity Schema And Route Contracts

Canonical code sources: `lib/product/enterprise-identity-runtime.ts`, `lib/product/enterprise-identity-schema.ts`, and `lib/product/enterprise-identity-routes.ts`.

This is a future Enterprise contract. SSO, SCIM, group-role mappings, enterprise admin recovery, and customer-facing identity settings are not currently shipped. The contracts below are registry scaffolding only so future implementation work cannot invent schema, route, audit, or validation behavior ad hoc.

## Schema Contracts

All future tables are organization-scoped, lifecycle-aware, timestamped, indexed, linked to safe audit events, and forbidden from storing raw IdP/provider payloads in safe metadata.

| Table | Status | Lifecycle field | Provider scope | Key governance rule |
| --- | --- | --- | --- | --- |
| `enterprise_sso_configurations` | future | `sso_lifecycle_state` | SAML 2.0, OIDC | Store fingerprints, expiry, issuer, and secret references only; raw certificates, private keys, and client secrets must live in encrypted secret storage. |
| `enterprise_verified_domains` | future | `domain_verification_state` | SAML 2.0, OIDC | Domain proof values must be represented as fingerprints or secret references; domain release must suspend routing first. |
| `enterprise_scim_users` | future | `provisioning_state` | SCIM 2.0 | Default deprovisioning is `soft_deprovisioned`; hard deprovisioning requires retention and audit gates. |
| `enterprise_group_role_mappings` | future | `mapping_state` | SAML 2.0, OIDC, SCIM 2.0 | Group identifiers are hashed/stable IDs only; mappings must never silently elevate users. |
| `enterprise_identity_events` | future | `event_lifecycle_state` | SAML 2.0, OIDC, SCIM 2.0, manual enterprise admin | Events link to audit rows and safe fingerprints only; event deletion must not hide provisioning or recovery evidence. |

Required shared fields and controls:

- `organization_id` is required on every future table.
- `created_at` and `updated_at` are required on every future table.
- Each table declares uniqueness constraints and indexes before implementation.
- Each table declares deletion/deprovisioning behavior before implementation.
- Each table declares audit linkage to `enterprise.*` identity audit-event contracts.
- Safe metadata must not include raw IdP assertions, SAML responses, OIDC tokens, SCIM payloads, provider payloads, certificates, private keys, client secrets, passwords, storage paths, or debug traces.

## Future Route Contracts

The route registry defines future API shape without creating live runtime routes.

| Route | Status | Auth boundary | Required capability | Audit event |
| --- | --- | --- | --- | --- |
| `GET /api/enterprise/identity/sso/configuration` | deferred | future Enterprise admin/owner session | `future_sso_settings` | `enterprise.sso_configured` |
| `POST /api/enterprise/identity/sso/configuration` | deferred | future Enterprise admin/owner session | `future_sso_settings` | `enterprise.sso_configured` |
| `POST /api/enterprise/identity/sso/metadata` | deferred | future Enterprise admin/owner session | `future_sso_settings` | `enterprise.idp_metadata_changed` |
| `POST /api/enterprise/identity/sso/domain-verification` | deferred | future Enterprise admin/owner session | `future_sso_settings` | `enterprise.domain_verification_started` |
| `POST /api/enterprise/identity/sso/test` | deferred | future Enterprise admin/owner session | `future_sso_settings` | `enterprise.idp_metadata_changed` |
| `POST /api/enterprise/identity/scim/v2/Users` | deferred | future SCIM bearer token | `future_scim_provisioning` | `enterprise.scim_user_provisioned` |
| `PATCH /api/enterprise/identity/scim/v2/Users&#47;:id` | deferred | future SCIM bearer token | `future_scim_provisioning` | `enterprise.scim_user_provisioned` |
| `DELETE /api/enterprise/identity/scim/v2/Users&#47;:id` | deferred | future SCIM bearer token | `future_scim_provisioning` | `enterprise.scim_user_deprovisioned` |
| `GET /api/enterprise/identity/group-role-mappings` | deferred | future Enterprise admin/owner session | `future_permission_groups` | `enterprise.role_group_mapping_changed` |
| `POST /api/enterprise/identity/group-role-mappings` | deferred | future Enterprise admin/owner session | `future_permission_groups` | `enterprise.role_group_mapping_changed` |
| `POST /api/enterprise/identity/admin-recovery` | deferred | future enterprise admin break-glass | `future_admin_delegation` | `enterprise.admin_recovery_used` |

Route contract rules:

- Every route is `allowedRuntimeToday: false`.
- Every route is Enterprise-gated and tied to a future RBAC capability.
- Every route declares lifecycle state references, rate-limit expectations, idempotency expectations, audit event, monitoring event, forbidden fields, and release gates.
- Every future route must pass through `lib/product/enterprise-identity-runtime.ts` for Enterprise admin/owner gating, SCIM state normalization, group-role mapping safety, deprovisioned/locked access semantics, and safe audit metadata shaping.
- SCIM create/update/delete routes must preserve provisioning and deprovisioning semantics: `pending`, `active`, `locked`, `soft_deprovisioned`, and `hard_deprovisioned`.
- Admin recovery is future-only break-glass behavior and must not become hidden founder rescue.

## Validation Contracts

The validation contract registry includes:

- `saml_metadata`
- `oidc_issuer_client_metadata`
- `domain_verification_request`
- `sso_test_request`
- `scim_user_create_payload`
- `scim_user_update_payload`
- `scim_user_delete_payload`
- `group_role_mapping_payload`
- `admin_recovery_payload`

Validation rules:

- SAML metadata validation may persist metadata URLs, fingerprints, issuer, and certificate expiry, but not raw XML or raw certificate bodies.
- OIDC validation may persist issuer/client identifiers and secret references, but not client secrets, tokens, authorization codes, or provider payloads.
- Domain verification may persist domain, method, status, reason code, and proof fingerprints, but not raw DNS proof values.
- SSO tests must not persist assertions or token payloads.
- SCIM create/update/delete validation must normalize to safe identifiers, lifecycle states, role IDs, reason codes, and hashed external IDs; full SCIM payloads are forbidden.
- Group-role mapping validation must use hashed group IDs or stable provider IDs, not raw claims.
- Runtime normalization must reject owner, admin, internal, and future enterprise role escalation through provider group mappings.
- Admin recovery validation must store safe evidence IDs and reason codes, not support notes, IdP payloads, provider assertions, or secrets.

## Privacy And Audit Rules

Future implementation must not log raw IdP assertions, raw SAML responses, OIDC ID/access/refresh tokens, authorization codes, raw certificates, private keys, client secrets, SCIM payloads, provider requests/responses, passwords, storage paths, or debug traces.

Audit metadata should use:

- `organization_id`
- `request_id`
- `provider`
- `previous_state`
- `new_state`
- `domain`
- `metadata_fingerprint`
- `certificate_fingerprint`
- `certificate_expires_at`
- `target_user_id`
- `scim_user_id`
- `group_id_hash`
- `role`
- `reason_code`
- `recovery_method`

Monitoring metadata should use stable event names, failure codes, organization IDs, actor IDs, request IDs, and safe fingerprints only.

## Promotion Requirements

Before any route or table becomes live runtime, the Enterprise identity release gate must prove:

- Tenant-scoped schema migration and RLS design.
- Secret and certificate storage design.
- SAML/OIDC signature, replay, issuer, audience, and clock-skew validation.
- SCIM token authentication, idempotency, rate limits, provisioning lifecycle, and deprovisioning lifecycle.
- Group-role mapping authorization tests.
- Domain verification ownership tests.
- Break-glass admin recovery runbook and audit tests.
- Monitoring and alerting for misconfiguration, lockout, certificate expiry, and provisioning failures.
- Customer-facing docs that clearly describe shipped behavior without implying full CLM or broad enterprise workflow scope.
