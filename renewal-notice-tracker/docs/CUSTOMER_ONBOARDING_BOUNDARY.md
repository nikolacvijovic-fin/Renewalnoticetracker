# Customer Onboarding Boundary

Canonical code sources: `lib/product/customer-onboarding.ts` and `lib/product/event-taxonomy.ts`.

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

## Evidence Model

Each milestone must declare:

- owner surface
- shipped event evidence from [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md)
- future event evidence from [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md), clearly marked future/deferred
- state/query fallback evidence when durable workflow state exists but no exact event is emitted today
- privacy sensitivity
- customer-visible copy expectation
- support follow-up expectation
- release proof
- forbidden behavior

Onboarding copy should move operators toward upload, review, owner assignment, trusted reminder activation, decision, export, and loop closure.

## Measurable Today

The following milestones are measurable today through shipped event evidence, state/query fallback evidence, or both:

| Milestone | Shipped event evidence today | State/query fallback evidence |
| --- | --- | --- |
| `workspace_created` | `auth_signup_completed`, `trial.started` | active organization and membership queries |
| `first_contract_uploaded` | `contract_upload_completed`, `import_completed`, `contracts.imported` | organization-scoped contract counts and processing status |
| `first_contract_reviewed` | `contract_review_completed`, `contract.review_updated` | reviewed contract count and metadata review state |
| `first_owner_assigned` | `contract_owner_assigned` | owner coverage and missing-owner queries |
| `first_reminder_trusted` | `reminder.created`, `reminder_scheduled`, `reminder_sent` | trusted reminder count and blocked-state summary |
| `first_decision_recorded` | `renewal_decision_recorded`, `renewal_decision.created` | renewal decision status queries |
| `first_export_completed` | `contracts.exported`, `export_sync_completed`, `export_background_completed` | export request and artifact status queries |
| `billing_configured` | `billing.checkout_started`, `billing.webhook_synced`, `checkout_completed`, `billing_webhook_succeeded` | canonical billing snapshot |
| `first_intelligence_viewed` | `intelligence.risk_badge_viewed`, `intelligence.risk_explanation_viewed`, `intelligence.risk_queue_viewed`, `intelligence.financial_viewed`, `intelligence.procurement_viewed` | shared intelligence access map and billing snapshot |
| `renewal_loop_completed` | `acknowledgment_recorded`, `renewal_decision_recorded`, `renewal_cycle.updated` | cycle status and renewal-loop completion summaries |

Future event evidence such as `organization.created`, `reminder.trusted`, `reminder.activated`, `cycle.closed`, and `billing.provider_exception_configured` is intentionally not treated as shipped telemetry until emitting code exists.

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

Any expansion beyond the current first-value path must update `lib/product/customer-onboarding.ts`, `lib/product/event-taxonomy.ts`, [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md), [SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md](SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md), [enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md](enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md), and the platform module registry.
