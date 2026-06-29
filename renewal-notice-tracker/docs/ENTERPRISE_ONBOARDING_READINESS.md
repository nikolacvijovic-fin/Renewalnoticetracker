# Enterprise Onboarding Readiness

Canonical code source: `lib/product/enterprise-onboarding-readiness.ts`.

Enterprise onboarding readiness is a support-safe launch model layered on top of the shipped renewal-control onboarding checklist. It is not a CRM, customer success dashboard, health score, implementation-management suite, support impersonation tool, or claim that future enterprise identity features are live.

## Launch Gates

| Gate | Meaning |
| --- | --- |
| `pilot` | The customer can reach first renewal-control value: org profile, first contract, owner assignment, and trusted reminder path. |
| `paid_launch` | The customer can operate the paid renewal-control product: pilot readiness, canonical billing truth, and verified export capability. |
| `enterprise_launch` | The customer has reviewed enterprise-grade accountability, governance, operational contacts, and identity boundaries. Full enterprise launch remains blocked while provider-backed SSO/SCIM is future-only. |

## Readiness Categories

| Category | Required for | Current runtime meaning |
| --- | --- | --- |
| `organization_profile` | pilot, paid launch, enterprise launch | Organization basics and active workspace ownership are confirmed. |
| `billing_subscription` | paid launch, enterprise launch | Canonical billing snapshot shows active paid/trial state; provider labels alone do not grant readiness. |
| `first_contract_imported` | pilot, paid launch, enterprise launch | At least one organization-scoped contract exists. |
| `owner_assignment` | pilot, paid launch, enterprise launch | At least one reviewed contract has an accountable owner. |
| `reminder_policy` | pilot, paid launch, enterprise launch | At least one trusted reminder path exists after review, owner, and trust gates. |
| `export_capability` | paid launch, enterprise launch | A safe export/reporting preset has completed; basic export does not include notes, audit logs, raw evidence, or intelligence explanations. |
| `audit_event_visibility` | enterprise launch | Operators understand audit truth versus analytics, logs, and monitoring. |
| `data_governance_review` | enterprise launch | Retention, deletion, export artifact expiry, support-access, and privacy boundaries have been reviewed. |
| `operational_contacts` | enterprise launch | Billing/support/security or incident contacts are configured without storing raw customer data. |
| `identity_readiness` | enterprise launch | Current roles, future enterprise identity boundaries, and break-glass expectations have been reviewed. |
| `sso_scim_boundary` | enterprise launch | Runtime policy/contracts may exist, but provider-backed SSO login is not shipped and live SCIM provisioning endpoints are not shipped. |

## Status Semantics

Readiness items use:

- `complete`: the shipped runtime or reviewed launch state satisfies the category.
- `needs_action`: the category is shipped or reviewable today but incomplete.
- `unavailable`: reserved for a launch category that cannot be evaluated for this organization.
- `future`: the category is contract-ready or planned, but not live runtime capability.

`sso_scim_boundary` must remain `future` until real provider verification, live SCIM endpoint handling, persistence, and session revocation are implemented and tested. Reviewing the SSO/SCIM plan alone must not mark this category complete.

## Support-Safe Diagnostic Boundary

The support diagnostic view model may include:

- organization ID
- plan tier and subscription status
- billing provider label
- milestone/category statuses
- counts
- request IDs
- failure codes and categories

It must not include:

- raw contract text
- OCR output
- full notes
- raw extracted evidence
- provider payloads
- storage paths
- secrets or tokens
- uploaded document contents
- email bodies
- debug traces

The helper sanitizes and allowlists diagnostic metadata before returning it. Support output should explain status and next action, not interpret customer legal/commercial decisions.

## Relationship To Customer Onboarding

[CUSTOMER_ONBOARDING_BOUNDARY.md](CUSTOMER_ONBOARDING_BOUNDARY.md) owns the customer-facing first-value checklist. This enterprise readiness model owns launch/support readiness categories that may be used by internal operators, implementation review, or enterprise buyer-readiness conversations.

Future customer-facing enterprise setup UI must not be added until the corresponding runtime behavior is shipped and the docs/tests are updated.
