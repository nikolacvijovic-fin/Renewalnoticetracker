# Enterprise Admin Identity Guide

This is future-facing documentation. Enterprise SSO, SCIM provisioning, permission groups, and delegated enterprise administration are not currently shipped in NoticeControl.

Use this guide as the customer/admin documentation scaffold once the Enterprise identity module moves through its future release gate.

The future implementation plan lives in [ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md](ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md), and the future table, route, and validation contracts live in [ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md](ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md).

## SSO Setup

Future SSO setup will support SAML 2.0 and/or OIDC after provider-specific implementation.

Expected setup steps:
1. Verify the organization domain.
2. Choose the identity provider type.
3. Provide IdP metadata through the approved secure setup flow.
4. Confirm certificate expiry and metadata fingerprint.
5. Test login with a non-break-glass user.
6. Enable SSO only after recovery and audit checks are ready.

NoticeControl should never ask admins to paste secrets into support chat, notes, exports, or logs.

## SCIM Provisioning

Future SCIM support will manage user lifecycle records for Enterprise workspaces.

Expected behavior:
- Provisioned users begin in `pending`.
- Users become `active` only after organization, domain, role, and entitlement checks pass.
- Deprovisioned users are blocked from login.
- Locked users are blocked even if a stale organization membership still exists.
- Raw SCIM payloads are not exposed in customer audit logs or operational logs.

## Deprovisioning

Future deprovisioning behavior:
- `soft_deprovisioned` blocks login while preserving audit and workflow history.
- `hard_deprovisioned` requires retention, deletion, and customer policy gates.
- Existing ownership, reminder, and decision history should remain explainable without exposing identity provider payloads.

## Lockout And Recovery

Future lockout/recovery behavior:
- Locked users cannot authenticate through enterprise SSO.
- Recovery requires enterprise admin authority and a stable reason code.
- Break-glass recovery must be audited with `enterprise.admin_recovery_used`.
- Recovery should never rely on hidden founder interpretation.

## Audit Logs

Future identity audit logs should record:
- SSO configuration changes.
- SSO enabled/disabled.
- IdP metadata changes using fingerprints, not raw certificates.
- Domain verification started/completed/failed.
- SCIM provisioning and deprovisioning.
- Role/group mapping changes.
- User lockout and recovery.

Audit logs must never include raw IdP assertions, SAML responses, OIDC tokens, private keys, client secrets, raw certificates, full SCIM payloads, or provider payloads.

## Role And Group Mapping

Future role/group mapping will use the enterprise RBAC registry, not page-local role logic.

Provider group mapping must not grant `owner`, `admin`, internal roles, or future enterprise roles directly. Those privileges require explicit in-app authority, break-glass policy where applicable, and audit evidence.

Planned roles include:
- `security_admin`
- `billing_admin`
- `compliance_admin`
- `integration_admin`
- `report_admin`
- `support_admin_delegate`
- `finance_viewer`
- `legal_validator`
- `viewer`

These roles grant no current runtime access until a future Enterprise release gate enables them.

## Security Responsibilities

Customer responsibilities in a future Enterprise rollout:
- Maintain accurate IdP metadata.
- Rotate certificates before expiry.
- Keep SCIM provisioning accurate.
- Maintain at least one break-glass administrator.
- Review identity audit events after configuration changes.
- Report suspected lockout, tenant isolation, or unauthorized access incidents immediately.

NoticeControl responsibilities before shipping:
- Verify provider requests.
- Fail closed on invalid metadata, signatures, or domains.
- Keep logs/audits free of secrets and raw provider payloads.
- Provide runbooks for lockout, recovery, certificate expiry, and provisioning failures.
- Preserve the renewal-control product boundary without becoming a full IAM platform.
