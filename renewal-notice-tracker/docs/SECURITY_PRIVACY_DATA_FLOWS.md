# NoticeControl Security And Privacy Data Flows

This inventory documents where sensitive customer data moves through the shipped runtime. It is intentionally concise so contributors can check privacy boundaries before changing routes, exports, OCR, notes, billing, or internal operations.

## Sensitive Data Classes

| Data class | Stored in | Displayed in | Exported in | Logged/audited | Sent externally | Access boundary |
| --- | --- | --- | --- | --- | --- | --- |
| Uploaded contract files | Supabase storage and `contract_files` metadata | Contract detail file metadata only | Never by default | File name may appear in audit/internal detail; contents must never appear | OCR/AI provider only when extraction requires it | Active organization and shipped action permissions |
| Extracted contract text and OCR text | `contract_files.extracted_text` | Not displayed as raw text by default | Never | Never in logs/audit/errors | AI extraction provider receives bounded text | Service-side extraction paths only |
| Extracted evidence snippets | `extracted_field_evidence` and metadata evidence fields | Review/evidence UI where intentionally linked | Never in basic export | Customer audit summarizes counts/status, not raw snippets | AI provider output only | Active organization and review permissions |
| Contract metadata/P0 fields | `contract_metadata` | Contract list/detail/review/intelligence | Basic/workflow/intelligence presets by gate | Audit summaries may include safe state labels | Reminder email may include operational dates only | Active organization, role, and plan gates |
| Contract notes | `notes` | Contract detail for active organization users | Only `notes_and_decisions_export`, sanitized and truncated | Audit stores note length/redaction flag, not body | Not sent externally | Active organization; export limited to admin/operator Growth+ |
| Reminders and recipient emails | `reminders`, notification logs | Contract detail/timeline | Workflow exports include status/date, not provider payload | Audit logs workflow state; logs redact provider payloads | Email provider receives recipient and reminder content | Active organization, recipient policy, reminder trust gates |
| Export rows | Generated synchronously from scoped queries | Download response only | Selected preset only | Audit records preset, format, row count, sections, sensitivity | Not external unless user downloads | Role, plan, and intelligence access gates |
| Intelligence outputs | Calculated from trusted workflow state | Dashboards, risk badges, explanations | `intelligence_export` only | View/recalc audit events with counts/versions, not raw evidence | None by default | Intelligence role, owner, org, and plan gates |
| Billing webhook payloads | Normalized billing state only | Settings/billing UI | Never | Logs use named events without raw payloads | Provider sends signed webhook to app | Signature verification and billing service |
| Audit logs | `audit_logs` | Customer-safe summaries; internal detail behind internal role | Audit export deferred | Audit is the accountability record | Not external by default | Active organization; internal role for richer detail |
| Internal/destructive operation data | Internal route requests, workspace deletion lifecycle | Internal ops surfaces | Never customer-exported | Named structured logs and failure evidence without secrets | None | Purpose-specific secrets; destructive HMAC signing |

## Export Privacy Model

- Basic Contract Register (`basic_contract_register`) is the default and must not include notes, intelligence explanations, audit logs, raw evidence, OCR text, processing errors, provider payloads, or internal diagnostics.
- `workflow_export` may include workflow/reminder/decision status fields, but not notes or evidence.
- `notes_and_decisions_export` is role-gated to admin/operator and plan-gated. It includes note count, latest note date/author, and a sanitized bounded preview only.
- `intelligence_export` requires intelligence entitlement and access checks. It includes risk/financial fields and confidence metadata, not explanations or raw evidence.
- `audit_export` remains deferred/admin-only until redaction, scope, and packaging are hardened.
- Denied exports must stop before row assembly.

## OCR And AI Provider Flow

Uploaded files are parsed server-side. When native extraction is weak, OCR may be performed through the configured OCR provider. AI extraction receives bounded document text for structured metadata extraction.

Privacy rules:
- never log raw uploaded content
- never log OCR output
- never include raw document text in processing error messages
- never expose provider secrets in errors
- record failures with generic operational messages and safe identifiers only

## Notes Privacy Model

Notes are active-organization scoped. Full note body may be displayed in the contract detail UI to authorized organization users, but must not appear in structured logs, audit details, basic exports, workflow exports, intelligence exports, or error messages.

Audit evidence for notes should record that a note was created and include safe metadata such as note length or redaction status, not note text.

## Audit, Logs, Analytics, Monitoring

- Audit: customer/accountability truth, redacted to safe summaries in customer UI.
- Logs: operator/debugging signal; never include raw contract text, notes, OCR output, evidence, provider payloads, tokens, cookies, secrets, or document contents.
- Analytics: product usage; do not treat it as audit truth or a place for sensitive payloads.
- Monitoring: named operational events sourced from logs/audit state.

## Internal And Destructive Routes

Internal routes use purpose-specific secrets. Destructive routes require the destructive secret plus timestamped HMAC signing. Failures must fail closed and return safe errors that do not reveal cross-tenant entity existence.

Workspace deletion attempts and failures should be logged/audited with request IDs and failure stages, never raw customer data.

## Billing Privacy Model

Billing webhooks must be signature verified before normalized state changes. Raw provider payloads and provider secrets must not enter logs, audit rows, or user-facing errors. Entitlement denials may record feature, reason, plan tier, and source context, but not provider secrets or raw webhook payloads.

## Never Export Or Log By Default

- raw contract text
- full notes
- OCR output
- raw extracted evidence
- provider payloads
- payment provider secrets
- auth tokens/cookies
- uploaded document contents
- internal diagnostic payloads
