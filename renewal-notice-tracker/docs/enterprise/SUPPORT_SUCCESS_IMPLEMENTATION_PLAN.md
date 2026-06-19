# Support Success Implementation Plan

Status: future Enterprise planning and shipped-kernel support discipline. This document does not ship impersonation, customer health dashboards, a CRM, a support console, or customer-facing success analytics.

Canonical boundaries:

- [../CUSTOMER_ONBOARDING_BOUNDARY.md](../CUSTOMER_ONBOARDING_BOUNDARY.md)
- [../SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](../SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md)
- [../EVENT_TAXONOMY.md](../EVENT_TAXONOMY.md)
- `lib/product/customer-onboarding.ts`
- `lib/product/support-success.ts`
- `lib/product/event-taxonomy.ts`

## Phased Rollout

1. Registry and boundary: define onboarding milestones, support capabilities, health signals, diagnostic fields, forbidden raw data, event taxonomy evidence, and release proof.
2. Internal design review: threat-model support data access, purpose limitation, tenant scoping, escalation ownership, and customer communication.
3. Operational pilot: use existing internal ops diagnostics only, with no impersonation and no raw customer content.
4. Enterprise support gate: add support-access review, escalation workflow, incident communication, and customer communication evidence.
5. Controlled runtime enablement: expose only the exact support tooling proven by tests, runbooks, monitoring, and customer docs.

## Onboarding Lifecycle

The supported onboarding path is:

1. Workspace created.
2. First contract uploaded.
3. First contract reviewed.
4. First owner assigned.
5. First reminder trusted.
6. First decision recorded.
7. First export completed.
8. Billing configured.
9. First intelligence viewed where entitled.
10. Renewal loop completed.

This path is about operational renewal-control adoption. It must not imply full CLM implementation, negotiation support, approvals, e-signature, or legal review.

## Diagnostic Lifecycle

Support diagnostics may collect:

- IDs
- status values
- counts
- failure codes/categories
- queue health
- job IDs
- request IDs
- timestamps

Support diagnostics must not collect raw contract text, full notes, OCR output, raw extracted evidence, provider payloads, storage paths, secrets, tokens, full billing payloads, or raw customer files.

## Health Signal Lifecycle

Future customer health signals should remain internal-only until:

- formulas are documented
- severity mapping is reviewed
- customer communication copy is approved
- support actions are defined
- privacy boundaries are tested
- false-positive handling exists

Signals should route support to product actions: upload, review, assign, trust reminders, decide, export safely, fix billing exception state, or inspect OCR/export/reminder failure codes.

Signals must declare whether they are computable today or future-only:

- Computable-today signals may use shipped audit, analytics, monitoring, and state/query evidence from `lib/product/event-taxonomy.ts`.
- Future-only signals may reference future event contracts such as `support.escalation_opened` and `support.enterprise_security_review_requested`, but they must not appear as runtime product evidence.
- No signal may use raw contract text, full notes, OCR output, provider payloads, storage paths, tokens, secrets, or uploaded document contents.

## Escalation Lifecycle

Future escalation workflow must define:

- escalation ID
- severity
- owner role
- status
- opened/closed timestamps
- reason code
- customer communication state
- audit event
- monitoring event

Escalation must not become hidden founder rescue or support-owned workflow mutation.

## Incident Customer Communication

Future incident communication must include:

- severity and impact
- affected organization scope
- current status
- mitigation/remediation
- next update timing
- customer-safe explanation

It must not include raw customer content, another tenant's data, secrets, provider payloads, storage paths, or implementation stack traces.

## Support Access Review

Future support access review must link to data governance support-access evidence and include:

- support actor
- organization ID
- purpose code
- object class
- reviewed timestamp
- reviewer or policy evidence

Support access review remains future-only until Enterprise governance, retention, audit, and customer communication controls are ready.

## Release Gate

Before live support/success tooling ships:

- `lib/product/customer-onboarding.ts` and `lib/product/support-success.ts` must be updated.
- `lib/product/event-taxonomy.ts` and [../EVENT_TAXONOMY.md](../EVENT_TAXONOMY.md) must distinguish emitted-today events from future/deferred evidence.
- [../CUSTOMER_ONBOARDING_BOUNDARY.md](../CUSTOMER_ONBOARDING_BOUNDARY.md) and [../SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](../SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md) must reflect exact shipped scope.
- `tests/customer-onboarding-support-boundary.test.ts` must prove safe metadata, forbidden raw-data boundaries, no impersonation, no fake health UI, and platform registry alignment.
- `tests/event-taxonomy-onboarding-support.test.ts` must prove onboarding/support references only real emitted events, explicit future events, or documented state/query fallbacks.
- Operational runbooks must cover escalation, incident communication, billing exceptions, export/OCR/reminder failures, and support-access review.
