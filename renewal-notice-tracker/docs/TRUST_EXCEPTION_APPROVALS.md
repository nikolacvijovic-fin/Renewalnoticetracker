# Trust Exception Approvals

NoticeControl uses the word "trusted" carefully. A low-confidence or manual-without-evidence contract can become workflow-trusted only when a human approval is recorded as an auditable trust exception.

## Runtime Rule

- Evidence confidence always means the strength of supporting evidence.
- Trust exception approval means a permitted human accepted workflow risk despite weak or missing evidence.
- Approval never mutates or inflates evidence confidence.
- Approval never sends notices automatically.
- Revoked or expired approvals do not count as active.

## Approval Record

The durable approval table is `contract_trust_exception_approvals`.

The initial approval types are:

- `low_confidence_evidence`
- `manual_without_evidence`
- `unsupported_extraction`

Each record is scoped by `organization_id` and `contract_id`, includes the approving user, source field keys, approval reason, evidence confidence at approval, and optional expiry/revocation fields.

Approval records are append-only after creation. The only allowed update is formal revocation, and revocation must set all of:

- `revoked_at`
- `revoked_by_user_id`
- non-empty `revocation_reason`

Immutable fields include organization, contract, approver, approval type, reason, source fields, evidence confidence at approval, expiry, and creation time. Direct deletion is rejected.

Evidence confidence at approval is server-computed from current contract metadata. Clients and forms must not submit or override `evidence_confidence_at_approval`.

## Authorization

Admins, operators, and reviewers may create or revoke trust exception approvals. Owners may view approval state as part of the contract workflow, but owner role alone does not create approvals.

## Audit

Trust exception approval workflows use privacy-safe audit events:

- `trust_exception_approval.created`
- `trust_exception_approval.revoked`
- `trust_exception_approval.denied`
- `trust_exception_approval.viewed`
- `trust_exception_approval.used_for_trusted_reminder_gate`

Audit metadata includes contract id, approval type, source field keys, evidence confidence at approval, and whether the approval is active. Audit metadata must never include raw contract text, OCR output, provider payloads, storage paths, full notes, secrets, or notice content.

The requested lifecycle names map to this repo's dot-style audit convention:

- `trust_exception_approval_created` -> `trust_exception_approval.created`
- `trust_exception_approval_revoked` -> `trust_exception_approval.revoked`
- `trust_exception_approval_denied` -> `trust_exception_approval.denied`
- `trust_exception_approval_used_for_trusted_reminder_gate` -> `trust_exception_approval.used_for_trusted_reminder_gate`

## Contract Detail Behavior

The contract detail view model shows legacy metadata approval markers only as historical/display context. Legacy metadata must not unlock trusted reminders. The durable approval table is the source of truth for V2 trusted reminder exceptions.

When an active approval allows a trusted reminder gate to pass despite low evidence confidence, the UI should show it as an exception state, not as strong evidence.

## SQL Boundary

`contract_trust_exception_approvals` uses RLS for org-scoped reads and review-capable inserts. The database trigger `prevent_contract_trust_exception_approval_mutation()` enforces immutability even if a future route accidentally attempts to update approval content.
