# Support Success Operations Boundary

Canonical code sources: `lib/product/support-success.ts` and `lib/product/event-taxonomy.ts`.

NoticeControl support and success operations exist to keep the renewal-control product safe to operate. They are not a full CRM, helpdesk, customer success platform, impersonation system, or raw-data browsing console.

The shipped customer onboarding checklist is a first-value product surface, not a support dashboard. Its progress model lives in `lib/product/customer-onboarding-progress.ts` and may use only shipped event evidence or durable state/query fallbacks from the onboarding registry.

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

Shipped support surfaces are intentionally narrow: the customer onboarding checklist, internal ops diagnostics, billing exception visibility, and assisted troubleshooting using codes and counts. Future support/success tooling needs an Enterprise support gate before becoming runtime product.

The current governance runtime has a narrow support-access review evidence helper for internal support/admin use. It can prepare purpose-limited, expiring, tenant-scoped, audit-safe review evidence, but it is not a customer-facing support-access portal and does not allow impersonation or raw-data browsing.

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

Customer health signals are future-runtime and internal-only. Some signals are computable today from shipped events or state/query summaries, but none appear as customer-facing scores or a support dashboard. Customer-facing scores require formulas, copy, support response, privacy, and appeal paths to be proven first.

Computable today from safe event or state/query sources:

- `no_contract_uploaded_after_signup`
- `contracts_uploaded_but_unreviewed`
- `contracts_without_owner`
- `reminders_not_trusted`
- `decisions_missing`
- `export_failed_repeatedly`
- `billing_exception_needs_followup`
- `ocr_queue_delayed`

Future-only signals:

- `support_escalation_open`
- `enterprise_security_review_pending`

Each signal must declare whether it is `computable_today` or `future_only`. Computable-today signals must reference real emitted events from [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) or real state/query sources. Future-only signals must reference future/deferred event contracts only. Each signal must use safe metadata only and must not carry customer content.

## Evidence Sources

Support signals may use:

- shipped audit events such as `contracts.export_background_failed` or `billing.webhook_synced`
- shipped analytics events such as `contract_upload_completed`, `contract_review_completed`, and `renewal_decision_recorded`
- shipped monitoring events such as `ocr_job_failed`, `reminder_retry_scheduled`, and `billing_webhook_failed`
- state/query summaries such as reviewed contract counts, owner coverage, reminder blocked-state summaries, export job status, OCR queue health, and canonical billing snapshots

Support signals must not depend on aspirational event names unless those names are explicitly marked future/deferred in `lib/product/event-taxonomy.ts`.

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

Support access review remains future/deferred as a customer-facing Enterprise capability until customer communication, retention, and review surfaces are implemented.

The current runtime foundation may record or prepare safe support-access evidence with:

- support actor ID
- internal support/admin role boundary
- organization ID
- purpose code
- governed object class
- optional object ID
- status such as `requested`, `approved`, `denied`, `reviewed`, or `expired`
- reviewer or policy evidence ID
- expiration timestamp
- safe metadata only

No current support surface may imply:

- support impersonation
- unrestricted raw-data browsing
- customer health scores
- hidden founder rescue
- support-edited workflow truth outside audited product actions

Expired support-access evidence must not be treated as active.

## Promotion Rules

Before live support/success tooling ships, the product must have:

- explicit registry status change
- event taxonomy update proving emitted versus future evidence
- tenant-scoped data access
- support role/auth boundary
- diagnostic allowlist and raw-data denylist
- audit and monitoring coverage
- customer communication expectations
- runbook and release-gate tests
