# Commercial Decision Workbench

The Commercial Decision Workbench is the V2 operating layer for renewal decisions. It connects contract metadata, accepted extraction evidence, renewal quote comparison, savings opportunities, trusted reminder readiness, ownership, deadlines, approval status, and enterprise audit events into one controlled commercial workflow.

It is not a cold outreach system, AI negotiation agent, Slack war room, legal advice engine, or generic CLM workflow.

## Domain Model

Recommended actions: `renew`, `renegotiate`, `cancel`, `escalate`, `defer`, and `needs_review`.

Decision statuses: `draft`, `evidence_pending`, `ready_for_review`, `in_approval`, `approved`, `rejected`, `finalized`, and `archived`.

Negotiation postures: `accept_quote`, `challenge_increase`, `ask_for_discount`, `request_term_change`, `consolidate_vendor`, `delay_renewal`, `terminate_service`, and `legal_review_required`.

## Ownership And Active Decision Rule

The decision row persists `owner_user_id` from the scoped contract. Recompute refreshes the owner from contract truth and preserves `approver_user_id` unless the approver is explicitly reassigned.

Only one non-archived commercial decision may exist for an organization and contract. The database enforces this with a partial unique index, and duplicate create attempts resolve safely by returning the existing active decision. Archived decisions do not block creation of a new active decision.

Workbench page reads are read-only. If no active decision exists, the page shows an empty state with a `Create decision` action. Rendering the page must not insert decision records.

## Evidence Sources

The workbench composes existing runtime evidence:

- Contract metadata and owner assignment
- Accepted contract extraction fields and confidence
- Renewal quote comparison summaries
- Quote findings and savings opportunities
- Trusted reminder readiness
- Renewal and notice deadlines
- Existing renewal cycle state

Creation and recompute automatically refresh core evidence links for the latest completed quote comparison, high/critical quote findings, accepted extraction fields, open savings opportunities, and trusted reminder readiness. Evidence refresh is idempotent: recompute updates existing evidence anchors instead of duplicating them.

Raw contract text, raw quote text, OCR output, provider payloads, storage paths, secrets, tokens, and unsafe AI output must never appear in workbench audit metadata or snapshots.

## Scoring Rules

Current scoring is deterministic:

- Missing owner adds `missing_owner`.
- Missing renewal date adds `missing_renewal_date`.
- Missing completed quote comparison keeps the decision in `evidence_pending`.
- Weak contract evidence adds `weak_contract_evidence`.
- Critical quote findings raise commercial risk and recommend `renegotiate`.
- Savings opportunities recommend a negotiation posture such as `challenge_increase` or `ask_for_discount`.
- Expired notice deadlines recommend `escalate`.
- Trusted reminder readiness uses `not_configured`, `configured_ready`, `configured_blocked_by_review`, `configured_blocked_by_owner`, `configured_blocked_by_dates`, and `not_applicable`.
- Missing reminder configuration adds `trusted_reminder_not_configured`.
- Only configured-but-blocked reminder states add `trusted_reminder_blocked`.

The score is advisory evidence. Final commercial truth comes from the approval/finalization workflow.

## Approval Flow

Typical lifecycle:

1. Create or recompute the decision.
2. Resolve blockers and missing evidence.
3. Assign an approver.
4. Submit for review.
5. Approve or reject by the assigned approver.
6. Finalize once approved.
7. Archive when the workflow is no longer active.

Approval authority is explicit:

- `submitCommercialDecisionForReview` requires an assigned approver unless a future documented fallback policy is added.
- `approveCommercialDecision` and `rejectCommercialDecision` require the acting user to match `approver_user_id`.
- Admins cannot bypass the assigned approver by approving directly. They must reassign the approver first.
- `reassignCommercialDecisionApprover` is limited to admin/operator action boundaries and emits `commercial_decision.approver_reassigned`.

Invalid transitions fail closed. A draft cannot be approved directly, rejected decisions cannot be finalized, finalized or archived decisions cannot be edited, and status updates use expected-status predicates so concurrent state changes return safe conflicts instead of overwriting newer workflow state.

## UI Actions

The action bar is state-aware:

- Draft, evidence-pending, and ready-for-review states show recompute and submission guidance.
- Submission appears only when blockers allow it and an approver is assigned.
- In approval, approve/reject are visible only to the assigned approver.
- Approved decisions show finalize.
- Finalized and archived decisions show no mutating workflow actions.
- Blocked decisions show recompute and blocker guidance instead of a primary submit action.

## Audit Events

Emitted audit events:

- `commercial_decision.created`
- `commercial_decision.recomputed`
- `commercial_decision.submitted_for_review`
- `commercial_decision.approved`
- `commercial_decision.rejected`
- `commercial_decision.finalized`
- `commercial_decision.archived`
- `commercial_decision.recommended_action_changed`
- `commercial_decision.negotiation_posture_changed`
- `commercial_decision.evidence_attached`
- `commercial_decision.evidence_refreshed`
- `commercial_decision.snapshot_created`
- `commercial_decision.approver_reassigned`
- `commercial_decision.approval_blocked`
- `commercial_decision.duplicate_create_resolved`

Audit metadata is limited to safe IDs, status transitions, recommendation/posture, risk, confidence, blocker/warning codes, estimated savings, currency, approver IDs, approval authority mode, duplicate-create resolution, and evidence refresh counts/types.

## Known Limitations

- Negotiation briefs and vendor communication drafts are draft-only and must be manually reviewed.
- It does not automatically update contract metadata.
- It does not send notices or vendor communications.
- It does not provide a fallback approval policy yet; assigned approver is required.
- Provider-backed AI negotiation briefs are future work and must add model/version governance, source evidence, prompt tracking, human approval, and safety tests before runtime exposure.
