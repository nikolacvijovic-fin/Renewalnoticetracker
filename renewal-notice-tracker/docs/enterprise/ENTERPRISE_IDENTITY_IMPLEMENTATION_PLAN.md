# Enterprise Identity Implementation Plan

Canonical code sources: `lib/product/enterprise-identity.ts`, `lib/product/enterprise-identity-runtime.ts`, `lib/product/enterprise-identity-schema.ts`, and `lib/product/enterprise-identity-routes.ts`.

This is a future Enterprise implementation plan. NoticeControl does not currently ship live SSO, SCIM provisioning, permission groups, retention controls, or customer-facing enterprise identity settings.

## Future Provider Scope

Planned provider classes:
- SAML 2.0 for enterprise IdP login.
- OIDC for enterprise IdP login where customers prefer modern OAuth/OIDC integration.
- SCIM 2.0-style provisioning for user lifecycle automation.

Out of scope until the Enterprise gate:
- Live SAML/OIDC routes.
- Live SCIM endpoints.
- Customer-visible SSO settings UI.
- IdP tokens, assertions, certificates, or SCIM payloads in logs or audit details.

## Lifecycle States

The state contract lives in `lib/product/enterprise-identity.ts`.

SSO configuration states:
- `not_configured`: the only state allowed in current runtime.
- `configured_disabled`: future-only stored configuration that cannot affect login.
- `metadata_pending`: future-only state for incomplete or invalid IdP metadata/certificate evidence.
- `domain_verification_pending`: future-only state while domain ownership is being proven.
- `enabled`: future-only state where enterprise SSO may participate in login.
- `degraded`: future-only state for partially available SSO requiring operator visibility.
- `suspended`: future-only fail-closed state for security, billing, legal, or customer request reasons.

Provisioning/deprovisioning states:
- `pending`: future-only user received but not active.
- `active`: future-only SCIM-managed user active after org/role checks.
- `soft_deprovisioned`: future-only reversible login block retaining audit history.
- `hard_deprovisioned`: future-only terminal lifecycle state after retention requirements.
- `locked`: future-only security/recovery lockout state.

## Future Schema And Route Contracts

The future table, route, and validation contracts live in [ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md).

Planned future records:
- `enterprise_sso_configurations`
- `enterprise_verified_domains`
- `enterprise_scim_users`
- `enterprise_group_role_mappings`
- `enterprise_identity_events`

Planned future route families:
- SSO configuration and metadata routes.
- Domain verification and SSO test routes.
- SCIM v2 user create/update/delete routes.
- Group-role mapping routes.
- Enterprise admin recovery route.

These contracts are not live runtime behavior. They exist so future implementation work has explicit org scoping, lifecycle, audit, rate-limit, idempotency, privacy, and validation expectations before any route or migration ships.

## Current Safe Runtime Bridge

`lib/product/enterprise-identity-runtime.ts` is the current implementation seam. It does not add live SSO login, live SCIM endpoints, customer-visible identity settings, or provider calls. It exists so future route/service code cannot improvise identity truth.

The bridge currently provides:
- Enterprise identity access evaluation requiring org admin or owner role, Enterprise plan, active/trialing subscription status, and explicit feature enablement.
- SSO configuration readiness shaping for `draft`, `configured`, `active`, `disabled`, `error`, and `future` states. This can identify future-login readiness but cannot affect current login behavior.
- Prepared SAML/OIDC provider configuration contracts and SSO callback decision shaping that consumes verified provider results only; raw assertions, tokens, certificates, and provider payloads are not accepted as audit evidence. Callback decisions audit against `identity.sso_callback_prepared` and carry hashed identifiers only.
- Hashed-identifier SSO callback decisions through `evaluateEnterpriseSsoVerifiedCallbackDecision`, which accepts provider type, provider ID, organization/domain scope, provider status, member status, and already-hashed subject/email identifiers only. It can prepare a future session-binding intent, but `canAffectCurrentLogin` remains `false`.
- Provisioning-state login behavior where only `active` may authenticate; `pending`, `soft_deprovisioned`, `hard_deprovisioned`, and `locked` are fail-closed.
- SCIM create/update/delete/lock/recover normalization into organization-scoped safe state with hashed external identifiers.
- SCIM bearer-token authentication contracts, route-adjacent endpoint response shaping, and SCIM mutation decisions that require Enterprise entitlement, explicit feature enablement, directory organization scope, and break-glass preservation for privileged users.
- Canonical SCIM endpoint mutation decisions through `prepareEnterpriseScimEndpointMutationDecision`, which accepts safe hashed identifiers and routes provision/update/deprovision/lock/unlock through the same role-mapping, lifecycle, break-glass, and revocation-intent policy as the older helper paths.
- Session revocation status and intent contracts after SCIM deprovision, member lock, or deactivation. Current helpers can report `no_revocation_needed`, `revocation_required`, `revocation_future_only`, or `revocation_completed`, but live runtime remains `revocation_future_only` until a real auth-session backend is wired.
- Group-role mapping normalization that rejects `owner`, internal roles, and future enterprise roles. `admin` is denied by default and may be mapped only when an explicit future Enterprise policy flag permits it.
- Safe audit-input shaping for `enterprise.*` audit contracts using allow-listed metadata only, including precise future contracts for provider configuration, SSO configuration changes, SCIM provision/update/deprovision, member lock/unlock, group mapping, and break-glass preservation/blocking.

The bridge intentionally does not persist records, revoke sessions, call providers, create API routes, or expose settings UI. The prepared contract layer exists so future provider-backed SSO/SCIM work has safe inputs, deterministic outputs, hashed identifiers, endpoint decision shapes, and revocation intent evidence, but live SSO login, live SCIM HTTP endpoints, persistence-backed identity records, and real session revocation remain future-only until the Enterprise release gate and the schema/route contracts in [ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md) are implemented.

## Login Lifecycle

Future login flow:
1. Resolve workspace/domain and SSO configuration.
2. Fail closed unless configuration state is `enabled` or an explicitly recoverable `degraded` state.
3. Validate SAML/OIDC response using issuer, audience, signature, time bounds, and replay protection.
4. Resolve user identity to a verified organization membership or SCIM-managed pending user.
5. Apply enterprise role/group mapping through the central RBAC boundary.
6. Create a session only after current organization, role, billing, provisioning, deprovisioning, and lockout checks pass.

Current runtime remains unchanged and must treat enterprise SSO as `not_configured`.

## Invite Lifecycle

Future invite behavior:
1. Admin invites remain available only where enterprise policy allows them.
2. Domain-managed users may be redirected to the IdP instead of passwordless/default auth.
3. Invites must not bypass SCIM deprovisioning or lockout state.
4. Invite acceptance must audit organization, actor, target user, and safe reason codes.

## Provisioning Lifecycle

Future SCIM provisioning behavior:
1. Authenticate the SCIM bearer token by comparing safe token fingerprints; raw bearer tokens must never be logged or stored in audit metadata.
2. Validate organization, directory, domain, user identity, and external ID scope.
3. Create or update a user lifecycle record in `pending`.
4. Apply role/group mapping only through the enterprise RBAC registry; group mapping must never grant `owner`, internal, or future enterprise roles, and `admin` requires an explicit policy flag.
5. Move to `active` after all gates pass.
6. Audit using stable IDs, state transitions, role IDs, and reason codes only.
7. Updates use `enterprise.scim_user_updated`; lock/recovery use `enterprise.identity_member_locked` and `enterprise.identity_member_unlocked`; deprovisioning uses `enterprise.scim_user_deprovisioned`.

Raw SCIM payloads, provider requests, provider responses, tokens, and secrets must never be written to customer-visible audit logs or operator logs.

## Deprovisioning Lifecycle

Future deprovisioning behavior:
1. SCIM disable/delete moves user to `soft_deprovisioned` by default.
2. `soft_deprovisioned` blocks new sessions immediately.
3. Existing sessions must be revoked or invalidated through a dedicated future session control path. Current runtime helpers create planned revocation intent and report `revocation_future_only` unless a future auth-session backend explicitly marks revocation available/completed.
4. `hard_deprovisioned` may occur only after retention, deletion, audit, and customer policy gates pass.
5. Owner assignment, reminder accountability, and historical audit records must retain safe references without exposing raw identity provider payloads.
6. Deprovisioning or locking an admin/owner must preserve at least one accountable admin/owner and a documented break-glass recovery path.

## Lockout And Recovery Lifecycle

Future lockout/recovery behavior:
1. Lockout can be triggered by deprovisioning, IdP mismatch, suspicious state, or customer security request.
2. Recovery requires enterprise admin authority, audit evidence, and a stable reason code.
3. Fallback admin recovery must be limited to verified break-glass administrators.
4. Recovery must not expose raw IdP assertions, certificates, tokens, SCIM payloads, or provider debug data.
5. Runtime SCIM mutation decisions must reject privileged lock/deprovision operations that would leave no admin/owner or no documented break-glass path.

## Domain Verification

Assumptions for future implementation:
- Domain verification is required before domain-based SSO routing can be enabled.
- Verification evidence should be code-first: domain, status, method, timestamp, and stable reason code.
- DNS proof values must be treated as sensitive operational material and not shown broadly.
- Failed verification should keep SSO in `domain_verification_pending` or `configured_disabled`, never partially enabled.

## IdP Metadata And Certificate Rotation

Future rotation behavior:
- Store only necessary IdP metadata fields for verification.
- Audit metadata changes with fingerprints and expiry dates, not raw certificates.
- Expiring certificate alerts should be operational monitoring events.
- Rotation failures should move the configuration to `metadata_pending`, `degraded`, or `suspended` based on risk.
- Private keys and client secrets must never enter audit, analytics, logs, monitoring, or customer exports.

## Fallback Admin Recovery

Fallback recovery is a future Enterprise-only break-glass path.

Requirements before implementation:
- Dedicated enterprise admin role or equivalent customer-approved authority.
- Strong audit event: `enterprise.admin_recovery_used`.
- Preservation/blocking evidence: `enterprise.break_glass_admin_preserved` and `enterprise.break_glass_admin_blocked`.
- Safe metadata only: actor, target user, reason code, recovery method, request ID.
- Support runbook for customer communication and post-incident review.
- No hidden founder rescue as normal workflow.

## Phased Rollout Strategy

1. Registry and docs only: current pass.
2. Internal design review: data model, IdP metadata storage, session invalidation, and SCIM event idempotency.
3. Disabled admin scaffolding: no live provider calls, no runtime setting changes.
4. Private enterprise pilot: one IdP/provider path, strict audit/monitoring, no self-serve rollout.
5. General Enterprise release: SSO/SCIM docs, runbooks, support training, packaging, and release gates complete.

Promotion requires updating `lib/product/enterprise-identity.ts`, `lib/product/enterprise-identity-runtime.ts`, `lib/product/enterprise-identity-schema.ts`, `lib/product/enterprise-identity-routes.ts`, `lib/product/enterprise-rbac.ts`, [ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md), [../ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md](../ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md), and [../PLATFORM_MODULE_REGISTRY.md](../PLATFORM_MODULE_REGISTRY.md).
