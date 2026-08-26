# Full-Document Commercial Contract Intelligence

NoticeControl treats provider-backed extraction as confidential evidence for human review, never as contract truth or legal advice.

## Lifecycle

1. A review-capable user requests extraction for an organization-scoped contract and file.
2. The scoped admin repository verifies the contract/file relationship and downloads bytes from the configured private bucket. Callers cannot supply a storage URL.
3. PDF or DOCX signatures, size, corruption, encryption, and empty-document conditions are validated.
4. Native PDF pages or DOCX paragraphs/tables become page-aware records. Only PDF pages with insufficient native text are sent to the configured OCR provider.
5. The complete document is processed in bounded, overlapping chunks by the configured OpenAI model. `provider_backed` is recorded only for this real provider call.
6. Provider output is schema-validated, unknown fields are rejected, and every retained candidate must have an exact bounded source snippet on the cited page.
7. `contract_extracted_fields` stores candidates, confidence, versions, page/section/clause evidence, warnings, and review state.
8. A reviewer accepts, rejects, or edits candidates. Overrides require a reason; prior accepted evidence is superseded, not deleted.
9. Commercial calculations and findings are regenerated from accepted evidence only. Trusted reminders and downstream decisions remain behind existing reviewed-truth gates.

## Field Model

The versioned registry in `lib/contract-intelligence/commercial-schema.ts` is the single field-key source. It covers contract identity, term/renewal, financial terms, price-change mechanics, and commercial protections/exposure. Unsupported fields remain absent; they are not inferred into truth.

Each extracted field must carry:

- Confidence from `0` to `1`.
- Evidence status: `pending_review`, `accepted`, `rejected`, or `superseded`.
- Citation source metadata where available.
- A bounded, field-specific source snippet and source offsets where available.
- Source file, page, section/clause, extraction method, OCR confidence, provider/model, prompt version, and schema version.
- Warning codes when evidence is missing, low-confidence, or deterministic-only.

## Confidence Rules

Low-confidence extraction does not unlock trusted reminders. Partial runs remain `partial`; OCR/provider failures cannot be represented as successful empty extraction. Applying accepted evidence keeps metadata in review and preserves weak-evidence warnings until the existing P0 review gate is completed.

## Runtime Source Of Truth

`runFullDocumentContractExtraction` is the customer runtime source of extraction truth. The old Python `/extract-contract` regex route and TypeScript add-on client method are explicitly deprecated compatibility scaffolds for existing tests/reference work. They do not retrieve uploaded files, are not called by upload or OCR jobs, and must not be wired into customer extraction.

The legacy `lib/ai/extract-contract.ts` export is retained only as a compatibility adapter. It uses the same complete-document provider and no longer truncates input to 15,000 characters, but new code must use the page-aware runner.

## Commercial Analysis

Calculations use accepted evidence only, retain currencies separately, refuse ambiguous billing-period math, and calculate date urgency in the organization's configured IANA timezone (UTC fallback is explicit). The calculation set covers normalized annual and stated total cost, estimated remaining commitment, effective unit price, estimated renewal-term exposure, quantified termination-cost exposure, deadline distance, and fixed-uplift exposure. Every estimate is labeled and retains source field IDs and warning codes; missing or conflicting inputs produce `insufficient_evidence` or `conflict`, never fabricated values.

When accepted source documents disagree, an accepted, dated `amends` or `supersedes` relationship may select the governing accepted candidate for analysis. Pending relationships, pending fields, incomplete chains, and cycles remain unresolved. Precedence does not overwrite source evidence or trusted contract metadata.

Findings contain evidence IDs, confidence, limitations, versions, and a recommended human action. Findings distinguish a missing reviewed termination right from a claim that no right exists, and estimates are never labeled as realized savings.

## Audit Events

Extraction writes enterprise audit evidence:

- `contract_extraction.requested`
- `contract_extraction.completed`
- `contract_extraction.failed`
- `contract_extracted_field.accepted`
- `contract_extracted_field.rejected`
- `contract_extracted_field.overridden`
- `contract_extracted_fields.applied_to_metadata`
- `contract_commercial_analysis.generated`

Audit metadata may include run IDs, field IDs, field keys, confidence values, warning codes, provider, extraction mode, reviewer ID, and failure codes.

Audit metadata must never include raw full contract text, raw OCR output, full notes, provider payloads, storage paths, secrets, tokens, uploaded document contents, or email bodies.

## Retention And Operations

Page text is confidential temporary processing data. Each row receives a 30-day `retention_expires_at`; the migration supplies a service-role-only purge function that operations must schedule. Durable reviewed evidence stores only bounded snippets, not complete provider responses or prompts. Runs have queued/processing/completed/partial/failed/cancelled states, idempotency keys, leases, attempts, safe errors, page counts, token counts, and model/schema/prompt versions.

## Honest Limits

- Applying evidence prepares metadata for review; it does not complete P0 review.
- Relationship rows can represent amendments/order forms/quotes, and conflicts are preserved. Ambiguous precedence still requires human confirmation; the system does not automatically prefer a later file without supported relationship/effective-date evidence.
- Quote comparison and usage evidence remain existing adjacent workflows; this extraction layer does not fabricate quote or usage inputs.
- Production acceptance still requires the migration, private storage, OpenAI, OCR, and the page-retention purge schedule to be configured and exercised in staging.
