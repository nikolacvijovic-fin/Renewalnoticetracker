# Commercial Decision Workbench

The Commercial Decision Workbench is the V2 operating layer for renewal decisions. It connects contract metadata, accepted extraction evidence, renewal quote comparison, savings opportunities, trusted reminder readiness, ownership, deadlines, approval status, and enterprise audit events into one commercial workflow.

It is not a cold outreach system, AI negotiation agent, Slack war room, legal advice engine, or generic CLM workflow.

## Domain Model

Recommended actions:

- `renew`
- `renegotiate`
- `cancel`
- `escalate`
- `defer`
- `needs_review`

Decision statuses:

- `draft`
- `evidence_pending`
- `ready_for_review`
- `in_approval`
- `approved`
- `rejected`
- `finalized`
- `archived`

Negotiation postures:

- `accept_quote`
- `challenge_increase`
- `ask_for_discount`
- `request_term_change`
- `consolidate_vendor`
- `delay_renewal`
- `terminate_service`
- `legal_review_required`

## Evidence Sources

The workbench composes existing runtime evidence:

- Contract metadata and owner assignment
- Accepted contract extraction fields and confidence
- Renewal quote comparison summaries
- Quote findings and savings opportunities
- Trusted reminder readiness
- Renewal and notice deadlines
- Existing renewal cycle state

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
- Trusted reminder gaps add a readiness blocker.

The score is advisory evidence. Final commercial truth comes from the approval/finalization workflow.

## Approval Flow

Typical lifecycle:

1. Create or recompute the decision.
2. Resolve blockers and missing evidence.
3. Submit for review.
4. Approve or reject.
5. Finalize once approved.
6. Archive when the workflow is no longer active.

Invalid transitions fail closed. A draft cannot be approved directly, rejected decisions cannot be finalized, and finalized or archived decisions cannot be edited.

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
- `commercial_decision.snapshot_created`

Audit metadata is limited to safe IDs, status transitions, recommendation/posture, risk, confidence, blocker/warning codes, estimated savings, and currency.

## Known Limitations

- The workbench does not generate negotiation messages.
- It does not automatically update contract metadata.
- It does not send notices or vendor communications.
- Provider-backed AI negotiation briefs are future work and must add model/version governance, source evidence, prompt tracking, human approval, and safety tests before runtime exposure.
