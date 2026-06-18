# Customer Onboarding Boundary

Canonical code source: `lib/product/customer-onboarding.ts`.

NoticeControl onboarding is a first-value path for the renewal-control kernel. It is not a customer success platform, CRM, health-score product, or full implementation-management suite.

## First-Value Path

The onboarding registry defines these milestones:

| Milestone | Current status | Product meaning |
| --- | --- | --- |
| `workspace_created` | shipped | Organization and member context exists. |
| `first_contract_uploaded` | shipped | A contract has entered upload/import flow, but it is not trusted workflow truth yet. |
| `first_contract_reviewed` | shipped | P0 review has converted required renewal fields into reviewed evidence. |
| `first_owner_assigned` | shipped | At least one contract has an accountable owner. |
| `first_reminder_trusted` | shipped | Review, owner, and trust gates allow a reminder to be trusted. |
| `first_decision_recorded` | shipped | A renewal decision has been recorded as workflow state. |
| `first_export_completed` | shipped | A gated export preset has completed. |
| `billing_configured` | shipped | Paddle self-serve or support-led exception billing is represented in canonical billing truth. |
| `first_intelligence_viewed` | shipped | A gated intelligence surface has been viewed with trust/confidence labels. |
| `renewal_loop_completed` | shipped | The operator completed the core loop from reviewed contract through owner/reminder/decision/close. |

## Signal Model

Each milestone must declare:

- owner surface
- audit signal
- analytics signal
- monitoring signal where operationally relevant
- privacy sensitivity
- customer-visible copy expectation
- support follow-up expectation
- release proof
- forbidden behavior

Onboarding copy should move operators toward upload, review, owner assignment, trusted reminder activation, decision, export, and loop closure.

## Privacy Boundary

Support follow-up may use:

- organization ID
- plan/status
- counts
- workflow state summaries
- failure codes/categories
- queue/job IDs
- request IDs
- timestamps

Support follow-up must not use:

- raw contract text
- full notes
- OCR output
- raw extracted evidence
- provider payloads
- storage paths
- tokens or secrets
- raw customer files

## What Is Not Shipped

The current onboarding boundary does not ship:

- customer-facing health scores
- support impersonation
- customer success dashboards
- CRM-style account management
- hidden founder rescue
- legal/CLM implementation claims

## Promotion Rules

Any expansion beyond the current first-value path must update `lib/product/customer-onboarding.ts`, [SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md), [enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md](enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md), and the platform module registry.
