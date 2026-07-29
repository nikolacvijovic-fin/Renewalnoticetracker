# Internal Outreach Revenue Intelligence

NoticeControl now supports a narrow internal outreach intelligence layer for renewal-defense workflows. It turns existing contract, quote, commercial-decision, and negotiation evidence into internal follow-up opportunities and draft-only messages.

This is not a cold email engine, CRM sync, enrichment system, scraping system, or external-send workflow.

## Shipped Runtime Scope

- Detect internal outreach opportunities from existing organization-scoped renewal evidence.
- Score opportunities with a bounded internal priority model using urgency, commercial impact, evidence coverage, safety, draft readiness, and suppression state.
- Resolve internal audience guidance from scoped organization membership context only; the module does not load global users or discover external contacts.
- Prepare an internal review sequence: owner note, finance/procurement/legal review, executive escalation, vendor-copy preparation, CRM-note preparation, and follow-up reminder guidance.
- Prepare support-safe CRM note previews for manual copy only. There is no CRM connection or automatic sync.
- Track opportunity lifecycle: `draft`, `evidence_pending`, `ready_for_review`, `in_approval`, `approved_for_copy`, `dismissed`, and `archived`.
- Generate bounded internal drafts for manual review and copy only.
- Require approval before copy is allowed.
- Support suppression records so internal outreach can be paused by audience, opportunity, contract, or hashed contact identifier.
- Use explicit suppression reason codes including `legal_hold`, `customer_sensitive`, `duplicate_opportunity`, `already_in_negotiation`, and `compliance_blocked`.
- Store evidence links to existing product evidence rather than raw contract text, full notes, OCR output, or provider payloads.
- Audit opportunity, draft, approval, suppression, playbook, and safety-block events.

## Explicitly Not Shipped

- No automatic sending.
- No outbound email provider integration.
- No external cold outreach runtime.
- No scraping, enrichment, or contact discovery.
- No CRM sequencing or campaign automation.
- No deceptive personalization claims.
- No vendor/customer communications delivered by the app.

## Opportunity Types

- `renewal_risk`
- `price_increase`
- `savings_opportunity`
- `vendor_consolidation`
- `stakeholder_review`
- `legal_review`
- `finance_review`
- `procurement_review`
- `expansion_signal`
- `churn_prevention`
- `contract_cleanup`
- `negotiation_follow_up`

## Privacy And Safety Rules

- Basic evidence is represented as safe labels, IDs, confidence, statuses, and reason codes.
- Draft bodies are bounded previews and sanitized before persistence.
- Suppression contact identifiers are hashed before storage.
- Raw contract text, full notes, OCR output, provider payloads, storage paths, secrets, tokens, uploaded documents, and raw customer files must not appear in outreach metadata, audit events, logs, or tests.
- Drafts may become `approved_for_copy`, but approval does not send or deliver anything.
- Suppression, legal-hold, unscoped personal-data, unsupported savings/relationship claims, external-delivery instructions, and raw-source markers block approval or require review.

## Audit Events

The following events are emitted by `lib/internal-outreach-intelligence/internal-outreach-intelligence.ts` and registered in `lib/product/event-taxonomy.ts`:

- `internal_outreach_opportunity.detected`
- `internal_outreach_opportunity.created`
- `internal_outreach_opportunity.recomputed`
- `internal_outreach_opportunity.dismissed`
- `internal_outreach_opportunity.archived`
- `internal_outreach.evidence_attached`
- `internal_outreach_draft.created`
- `internal_outreach_draft.regenerated`
- `internal_outreach_draft.submitted_for_approval`
- `internal_outreach_draft.approved_for_copy`
- `internal_outreach_draft.rejected`
- `internal_outreach_draft.archived`
- `internal_outreach_suppression.created`
- `internal_outreach_playbook_item.created`
- `internal_outreach.safety_blocked`
- `internal_outreach.priority_scored`
- `internal_outreach.audience_resolved`
- `internal_outreach.sequence_planned`
- `internal_outreach.crm_note_generated`
- `internal_outreach.safety_reviewed`
- `internal_outreach.duplicate_dismissed`

## Future Work Before External Outreach

External outreach remains blocked until all of the following exist:

- Organization-scoped external contact schema with RLS.
- Suppression and consent model for every deliverable channel.
- Provider integration safety review.
- Human approval workflow for every external message.
- AI prompt/version/evidence trace governance.
- Audit taxonomy for external send attempts and denials.
- Deliverability, opt-out, compliance, and abuse controls.
- Tests proving no tenant leakage, no raw sensitive payload logging, and no send without approval.
