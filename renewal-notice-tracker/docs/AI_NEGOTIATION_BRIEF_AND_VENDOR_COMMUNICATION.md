# AI Negotiation Brief And Vendor Communication Workflow

The negotiation workflow extends the Commercial Decision Workbench. It converts approved commercial decision evidence into an internal negotiation brief, draft-only vendor communication, approval steps, and playbook items.

It is not a cold outreach system, automatic email sender, legal advice engine, AI negotiation agent, or CRM workflow.

## Purpose

The workflow answers five operational questions for a risky renewal:

- What changed commercially?
- What should we ask the vendor for?
- Which approved evidence supports the position?
- What fallback position should we use?
- Who must approve a vendor-facing draft before anyone copies it manually?

The workflow appears only when the commercial decision recommends `renegotiate`, `escalate`, `cancel`, or `needs_review`.

## Workflow States

Negotiation brief statuses:

- `draft`
- `evidence_pending`
- `ready_for_review`
- `in_approval`
- `approved`
- `rejected`
- `archived`

Vendor communication draft statuses:

- `draft`
- `ready_for_review`
- `in_approval`
- `approved_for_copy`
- `rejected`
- `archived`

`approved_for_copy` means the user may manually copy the draft. The application still does not send anything externally.

## Strategy Rules

The current builder is deterministic and evidence-bound:

- Critical quote increase maps to `challenge_price_increase`.
- Removed discount maps to `preserve_existing_discount`.
- Open savings opportunity maps to `request_discount`.
- Expired notice deadline maps to `escalate_to_legal`.
- Cancellation recommendation maps to `cancel_or_nonrenew`.
- Missing quote comparison keeps the brief in `evidence_pending`.
- Low confidence evidence adds a review flag.

## Draft-Only Guarantee

Vendor communication generation is a controlled draft generator only:

- No external email, messaging, CRM, or integration API is called.
- The UI never shows a send button.
- Draft text is clearly marked as internal draft material.
- Approval changes only the copy state, not external delivery.

## Approval Model

Brief approval and draft approval are separate:

- A brief must be submitted to an assigned approver before approval.
- Only the assigned approver can approve or reject the brief.
- A vendor communication draft cannot be approved for copy until the related brief is approved.
- Only the assigned draft approver can approve the draft for copy.
- Archived, rejected, and approved records cannot be edited by recompute/regenerate actions.

## Evidence Model

Briefs may link to quote comparisons, high/critical quote findings, open savings opportunities, and accepted extraction fields. Evidence links are organization-scoped and include safe labels, IDs, confidence, and bounded metadata only.

Audit metadata must not include raw contract text, raw quote text, OCR output, generated draft body, provider payloads, secrets, tokens, storage paths, or unbounded notes.

## Audit Events

Emitted audit events:

- `negotiation_brief.created`
- `negotiation_brief.recomputed`
- `negotiation_brief.submitted_for_review`
- `negotiation_brief.approved`
- `negotiation_brief.rejected`
- `negotiation_brief.archived`
- `negotiation_brief.evidence_attached`
- `vendor_communication_draft.created`
- `vendor_communication_draft.regenerated`
- `vendor_communication_draft.submitted_for_approval`
- `vendor_communication_draft.approved_for_copy`
- `vendor_communication_draft.rejected`
- `vendor_communication_draft.archived`
- `negotiation_playbook_item.created`

## Known Limitations

- Provider-backed AI generation is not shipped.
- Draft generation is deterministic and conservative.
- The system does not store model versions, prompts, or AI evaluation records yet.
- There is no external vendor send path.
- There is no Slack, Teams, CRM, or outreach integration.
- A future provider-backed implementation must add prompt/version governance, source evidence lineage, human approval, hallucination prevention, red-team tests, and monitoring before runtime exposure.
