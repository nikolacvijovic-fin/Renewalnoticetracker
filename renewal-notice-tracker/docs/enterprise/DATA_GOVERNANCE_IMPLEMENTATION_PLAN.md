# Data Governance Implementation Plan

Status: Enterprise runtime bridge plus future Enterprise planning. No live customer-facing retention settings, legal hold, data residency, broad customer data export, or support-access review portal is shipped by this document.

Canonical boundary: [../DATA_GOVERNANCE_RETENTION_BOUNDARY.md](../DATA_GOVERNANCE_RETENTION_BOUNDARY.md), [../../lib/product/data-governance.ts](../../lib/product/data-governance.ts), and [../../lib/product/data-governance-runtime.ts](../../lib/product/data-governance-runtime.ts).

## Phased Rollout

1. Registry and policy model: define capabilities, data classes, retention posture, deletion behavior, exportability, legal hold applicability, audit, privacy risk, and forbidden metadata.
2. Internal review: threat-model deletion, backup, audit retention, support access, data export, and tenant isolation.
3. Operational evidence: prove workspace deletion, export artifact expiry, backup readiness, restore drills, and support diagnostics are reliable and safe.
4. Enterprise beta: enable a single narrow governance control for selected organizations after support and legal review. The current runtime MVP is retention-policy preparation and audit-safe evidence only; it does not automatically delete customer data.
5. General Enterprise release: ship only after customer-facing docs, DPA/security answers, support runbooks, and release gates match runtime behavior.

## Retention Policy Model

The runtime MVP can validate and prepare organization-scoped retention policy records for Enterprise-gated admins/owners. MVP policy records define:

- organization scope
- object class
- retention window
- deletion/minimization behavior
- status
- safe reason code

Future retention policies must additionally define:

- legal-hold override behavior
- backup behavior
- audit behavior
- customer communication requirements
- support-access visibility

Policies must not rely on page-local settings or hidden founder interpretation. A policy record alone must never silently delete customer data. Delete-after-window behavior remains `delete_after_window_requires_review` until deletion jobs, legal-hold blocking, customer communication, and audit release gates are implemented.

## Legal Hold Lifecycle

Future legal hold must support:

- hold creation
- hold scope review
- deletion/expiry blocking
- hold release
- audit evidence
- support-safe status display

Legal hold metadata may include hold ID, object class, actor ID, organization ID, reason code, and timestamps. It must not include raw contract text, OCR output, full notes, storage paths, provider payloads, tokens, secrets, or backup contents.

## Deletion Lifecycle

Current deletion behavior:

- owner requests workspace deletion
- internal destructive route executes deletion with stronger auth
- failure status and stage evidence are recorded when possible
- completed status is written only after critical destructive steps succeed

Future deletion-window behavior may add:

- scheduled deletion
- cancellation window
- legal-hold blocking
- customer notification
- backup aging explanation
- deletion certificate or evidence package

## Data Export Lifecycle

Current CSV/XLSX exports are reporting artifacts, not a full data export/DSAR system.

Future customer data export must define:

- object classes included
- redaction behavior
- artifact expiry
- download controls
- audit events
- support handling
- legal-hold interaction

Export packages must not include forbidden raw payloads unless explicitly governed and tested.

## Backup And Restore Evidence

Backup/restore evidence should expose only:

- environment
- status
- checked timestamp
- restore-tested timestamp
- recovery-time metrics
- safe summary

It must not expose backup contents, storage paths, secrets, raw documents, OCR output, full notes, or provider payloads.

## Support Access

Future support-access evidence should record purpose, actor, role, organization, object class, timestamps, and review status. It should not record raw customer content.

Support diagnostics remain operational metadata, not a customer data browsing surface.

## Current Runtime Bridge

`lib/product/data-governance-runtime.ts` is the current safe implementation seam. It does not ship customer-facing retention settings, legal hold, data residency, broad customer data export, or a support-access portal.

The bridge currently provides:

- Admin/owner plus Enterprise-gate checks for future retention policy changes.
- Organization-scoped retention-policy preparation with bounded retention windows, governed object classes, supported policy statuses, and safe audit evidence.
- A hard runtime invariant that retention policy preparation cannot enable automatic deletion by itself.
- Lifecycle normalization for workspace deletion, contract export, and support-access records.
- Explicit `requested`, `queued`, `processing`, `completed`, `failed`, `cancelled`, and `expired` state semantics.
- Downloadability checks that keep expired export artifacts unavailable.
- Purpose-code requirements and explicit metadata allowlists for support diagnostics.
- Support-access review evidence preparation for internal support/admin roles with purpose, governed object class, tenant scope, status, expiration, reviewer/policy evidence, and safe metadata only.
- Safe governance audit metadata shaping.

Future live governance routes must use this bridge before writing retention/deletion/export/support-access records.

## Release Gate

Before live retention/legal hold ships:

- data classes must be implemented end-to-end
- runtime lifecycle helpers must keep completed, failed, queued, cancelled, and expired states distinct
- legal hold must block relevant deletion/expiry operations
- audit events must be safe and complete
- tenant isolation must be proven
- backup behavior must be documented
- support-access rules must be tested
- customer-facing claims must be reviewed against runtime behavior
