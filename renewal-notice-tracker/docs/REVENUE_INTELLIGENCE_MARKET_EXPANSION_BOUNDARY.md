# Revenue Intelligence And Market Expansion Boundary

Canonical code sources: `deferred/revenue-intelligence/foundation.ts`, the compatibility shim `lib/product/revenue-intelligence.ts`, and `lib/product/market-profiles.ts`.

This is a future foundation only. NoticeControl does not currently ship a lead database, automated outreach generation, email sending automation, CRM sync, data enrichment, or a customer-facing revenue intelligence product.

## Current Supported Scope

The current foundation defines:

- a structured offer profile for Renewal Notice Tracker / NoticeControl Contract Intelligence
- deterministic ICP fit explanations from provided evidence
- future lead/company data contracts
- lead eligibility classification with explicit reason codes
- outreach compliance decisions: `allow`, `review`, or `block`
- future AI generation and QA contracts marked not live
- future approval states and safe transitions
- market profile fields for outreach mode, language, tone, compliance strictness, email providers, AI providers, payment providers, and restricted-market review

No outreach leaves the system from this foundation.

## Not A Mass Email Tool

This foundation must not be used as a spam system, scraping system, sanctions bypass, or automated campaign sender. It is not a mass email tool.

Rules:

- Compliance gate comes before generation or export.
- Human approval is required before outreach can be approved for export.
- Direct transition from generated draft to exported is forbidden.
- Suppression, opt-out, complaint history, restricted markets, and unsupported outreach modes block outreach.
- Missing legal basis, missing source evidence, unknown recipient type, or planned-market status requires review.
- The compliance helper is a product safety gate, not legal advice.

## Product And Offer Library

The first offer profile is `noticecontrol_contract_intelligence`.

It describes:

- target customer types
- buyer roles
- pain points
- value propositions
- use cases
- objections
- preferred CTA
- tone guidance
- supported markets and languages
- compliance sensitivity

Offer profiles are internal structured models. They are not customer-facing marketing claims by themselves.

## ICP Evidence Model

ICP scoring is deterministic and evidence-based. It may explain why a lead appears to fit or not fit, but it must not invent facts.

Required evidence is explicit in the ICP registry. Missing evidence reduces confidence or sends the lead to review. Disqualifiers such as consumer/student/job-seeker signals block fit.

## Future AI Generation Boundary

Future generation contracts may include:

- personalized outreach generation request
- generated subject/body/rationale
- QA review result
- spam-risk score
- invented-fact risk
- gender-assumption risk
- tone/language quality
- compliance warnings

These contracts are not live generation. Raw lead evidence and generated drafts must be handled as sensitive. Future implementation must prove generated copy contains no invented facts, legal advice, deceptive urgency, protected-class assumptions, or unsupported claims.

## Approval Queue Boundary

Future approval states:

- `draft_generated`
- `qa_failed`
- `needs_human_review`
- `approved_for_export`
- `rejected`
- `regenerated`
- `exported`

`approved_for_export` requires compliance allow, QA pass, and human approval. `exported` can only follow `approved_for_export`.

## Market Expansion Integration

Market profiles are infrastructure for lawful future adaptation. They are not sanctions evasion and not a provider restriction workaround.

`global/default` remains the only shipped market. Planned country/region profiles may express future language, provider, tone, payment, compliance, AI/OCR, email, and invoice assumptions, but compatibility is not runtime permission.

Restricted markets require legal/compliance review and cannot self-activate. They also block outreach modes by default.

## Promotion Requirements

Before revenue intelligence or outreach can become shipped runtime:

- the blockers in [REVENUE_INTELLIGENCE_RELEASE_GATE.md](REVENUE_INTELLIGENCE_RELEASE_GATE.md) must be satisfied
- source/evidence ingestion must be lawful and documented
- suppression and opt-out handling must be persistent and tested
- compliance/legal review must approve market-specific rules
- generated drafts must pass QA and invented-fact controls
- human approval and audit evidence must be required before export/send
- sending infrastructure, if ever added, must include rate limits, unsubscribe handling, bounce/complaint handling, provider policy compliance, and monitoring
- docs must remain honest that this is a focused renewal-control product, not a broad CRM or marketing automation suite
