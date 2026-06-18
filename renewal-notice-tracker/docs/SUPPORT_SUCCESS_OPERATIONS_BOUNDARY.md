# Support Success Operations Boundary

Canonical code source: `lib/product/support-success.ts`.

NoticeControl support and success operations exist to keep the renewal-control product safe to operate. They are not a full CRM, helpdesk, customer success platform, impersonation system, or raw-data browsing console.

## Capability Boundary

| Capability | Status | Current runtime surface |
| --- | --- | --- |
| `account_health_snapshot` | future | none |
| `onboarding_checklist` | shipped | customer services/checklist copy |
| `support_diagnostic_bundle` | shipped | internal ops, code-first diagnostics |
| `safe_account_notes` | future | none |
| `escalation_workflow` | future | none |
| `incident_customer_communication` | deferred | none |
| `support_access_review` | future | none |
| `assisted_troubleshooting` | shipped | internal ops |
| `enterprise_renewal_review` | future | none |
| `billing_exception_support` | shipped | internal ops and support-led billing exceptions |
| `data_export_deletion_support` | deferred | internal ops status only |

Shipped support surfaces are intentionally narrow: internal ops diagnostics, billing exception visibility, and assisted troubleshooting using codes and counts. Future support/success tooling needs an Enterprise support gate before becoming runtime product.

## Safe Diagnostic Bundle

Allowed diagnostic fields include:

- organization ID
- plan tier and subscription status
- billing provider label/status
- counts
- workflow state summaries
- failure codes and categories
- queue status
- export request IDs
- reminder job IDs
- OCR job IDs
- contract IDs
- request IDs
- timestamps

Diagnostics must not include:

- raw contract text
- full notes
- OCR output
- raw extracted evidence
- provider payloads
- storage paths
- tokens or secrets
- full billing payloads
- raw customer files
- uploaded document contents
- email bodies
- debug traces

## Customer Health Signals

Customer health signals are future-only and internal-only. They may guide support action, but they must not appear as customer-facing scores until formulas, copy, support response, privacy, and appeal paths are proven.

Future signals include:

- `no_contract_uploaded_after_signup`
- `contracts_uploaded_but_unreviewed`
- `contracts_without_owner`
- `reminders_not_trusted`
- `decisions_missing`
- `export_failed_repeatedly`
- `billing_exception_needs_followup`
- `ocr_queue_delayed`
- `support_escalation_open`
- `enterprise_security_review_pending`

Each signal must use safe metadata only and must not carry customer content.

## Escalation And Incident Communication

Future escalation and incident communication must define:

- severity
- escalation owner
- status
- reason/failure code
- customer communication status
- next update timing
- audit evidence
- monitoring event

Incident communication must never expose another tenant, raw provider payloads, raw customer files, secrets, or internal implementation details.

## Support Access Review

Support access review remains future/deferred until Enterprise-grade purpose limitation, audit evidence, customer communication, retention, and data-governance linkage are implemented.

No current support surface may imply:

- support impersonation
- unrestricted raw-data browsing
- customer health scores
- hidden founder rescue
- support-edited workflow truth outside audited product actions

## Promotion Rules

Before live support/success tooling ships, the product must have:

- explicit registry status change
- tenant-scoped data access
- support role/auth boundary
- diagnostic allowlist and raw-data denylist
- audit and monitoring coverage
- customer communication expectations
- runbook and release-gate tests
