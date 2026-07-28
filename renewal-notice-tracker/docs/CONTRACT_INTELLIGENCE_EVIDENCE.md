# Contract Intelligence Evidence

NoticeControl treats contract extraction as evidence for human review, not as contract truth.

## Lifecycle

1. A review-capable user requests extraction for an organization-scoped contract.
2. `contract_extraction_runs` records the run, provider, mode, status, requesting user, and safe failure state.
3. The Python intelligence service returns structured fields with confidence, warning codes, and citations.
4. `contract_extracted_fields` stores one bounded evidence row per field.
5. A reviewer accepts or rejects each field.
6. Accepted fields may be applied to `contract_metadata`, but applied metadata still has `needs_review = true`.
7. The existing P0 review/trusted-reminder gate remains responsible for trusted workflow activation.

## Field Model

Supported field keys are:

- `vendor_name`
- `renewal_date`
- `notice_deadline_date`
- `auto_renewal`
- `contract_value_amount`
- `contract_value_currency`
- `renewal_term`
- `termination_window`
- `price_change_trigger`
- `payment_terms`

Each extracted field must carry:

- Confidence from `0` to `1`.
- Evidence status: `pending_review`, `accepted`, `rejected`, or `superseded`.
- Citation source metadata where available.
- A bounded source snippet, capped at 1,000 characters in evidence storage and shortened further when copied into metadata snippets.
- Warning codes when evidence is missing, low-confidence, or deterministic-only.

## Confidence Rules

Low-confidence extraction does not unlock trusted reminders. Applying accepted evidence keeps metadata in review and preserves `has_weak_evidence` when confidence is below the review threshold or warning codes are present.

## Python Service

`services/python-intelligence` currently ships a deterministic scaffold for contract extraction. It can detect simple date, auto-renewal, notice-window, payment-term, and amount/currency patterns from supplied text and returns citations. It does not claim provider-backed AI extraction unless the future `provider_backed` mode is implemented and reviewed.

## Audit Events

Extraction writes enterprise audit evidence:

- `contract_extraction.requested`
- `contract_extraction.completed`
- `contract_extraction.failed`
- `contract_extracted_field.accepted`
- `contract_extracted_field.rejected`
- `contract_extracted_fields.applied_to_metadata`

Audit metadata may include run IDs, field IDs, field keys, confidence values, warning codes, provider, extraction mode, reviewer ID, and failure codes.

Audit metadata must never include raw full contract text, raw OCR output, full notes, provider payloads, storage paths, secrets, tokens, uploaded document contents, or email bodies.

## Current Limits

- Extraction evidence is durable and reviewable.
- Deterministic Python extraction is useful for scaffolding and tests, not a full AI provider-backed extractor.
- Applying evidence prepares metadata for review; it does not complete P0 review.
- Trusted reminders still depend on the existing reviewed-truth gate.
