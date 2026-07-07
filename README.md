[README.md](https://github.com/user-attachments/files/29586522/README.md)
# NoticeControl

NoticeControl is a vendor-side renewal and notice control system for teams that need to avoid missed contract deadlines, unmanaged auto-renewals, weak ownership, and last-minute renewal decisions.

The current product is intentionally narrower than a full contract lifecycle management platform. It focuses on one commercially useful operating loop:

```text
Upload or import contract data
-> Review renewal and notice fields
-> Assign an accountable owner
-> Activate trusted reminders
-> Acknowledge the reminder
-> Record the renewal decision
-> Close or continue the cycle
```

The long-term vision can include contract intelligence, procurement analytics, financial intelligence, integrations, and an internal revenue-intelligence/outreach engine. Those future modules must remain clearly separated from the shipped renewal-control kernel until they are intentionally activated.

## Product Purpose

Most small and mid-sized teams do not fail at renewals because they lack a full CLM system. They fail because contract deadlines are scattered across inboxes, PDFs, spreadsheets, calendar notes, and individual memory.

NoticeControl exists to create a controlled renewal operating system:

- contract files and imported contract rows are centralized
- key renewal and notice fields are extracted or entered manually
- low-confidence or unsupported fields require human review
- reminders only become trusted after review requirements are met
- every important action is organization-scoped and auditable
- owners are assigned before important renewal work is treated as operationally ready
- renewal decisions are recorded instead of being lost in email threads
- exports and calendar files support practical operations without turning the product into CLM bloat

The product should help users answer:

1. What contract needs attention?
2. What date or obligation matters?
3. Who owns the next step?
4. Can the reminder be trusted?
5. What decision was made?

## Current Shipped Scope

The shipped kernel is the only customer-facing runtime scope that should be treated as production product.

Current shipped capabilities:

- authentication with Supabase
- organization-scoped dashboard access
- customer roles for Admin, Operator, Reviewer, and Owner
- manual contract upload
- fixed CSV/XLSX import
- contract text extraction for supported files
- OCR fallback workflow where configured
- AI-assisted extraction of renewal and notice metadata
- human review for P0 renewal-control fields
- owner assignment
- trusted reminder generation after review requirements are met
- email reminders
- in-app due-soon and review-needed views
- reminder acknowledgment
- renewal decision recording
- cycle close/reopen actions
- counterparty normalization and alias support
- CSV and XLSX export
- per-contract ICS export
- billing gates and commercial entitlements
- Paddle self-serve billing in shipped-first runtime
- audit logs for trust-sensitive actions
- internal health, operations, OCR, restore-drill, backup-readiness, and destructive-ops routes
- release-critical unit and browser test gates

Out of scope for the shipped kernel unless explicitly activated:

- full CLM
- legal document negotiation
- contract drafting
- obligation management beyond the renewal-control loop
- autonomous sending of emails outside renewal reminders
- broad CRM functionality
- revenue intelligence
- cold outreach automation
- fully automated contract review without human approval
- generic analytics dashboards that do not support operating decisions

## Strategic Direction

The project can grow into a broader internal operating platform, but growth should be modular. The goal is not to create artificial line count. The goal is to add useful, testable, maintainable capabilities with clean ownership boundaries.

Potential future modules:

- Contract Intelligence
- Procurement Analytics
- Financial Intelligence
- AI Risk Scoring
- Calendar, Slack, Teams, and email integrations
- CRM integrations
- advanced reporting and operational analytics
- internal Revenue Intelligence and Personalized Outreach Engine
- compliance-aware lead and campaign workflow
- customer success and support economics dashboards
- enterprise audit, retention, and deletion controls

Future modules should be designed as add-ons, not mixed into the core contract workflow by default.

## Architecture Overview

The application uses:

- Next.js App Router
- React
- TypeScript
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Row Level Security
- Zod validation
- OpenAI structured extraction
- Resend email delivery
- Paddle billing
- Vitest for unit and integration-style tests
- Playwright for release-critical browser journeys
- GitHub Actions for CI and release-readiness gates

High-level runtime layers:

```text
app/
  Next.js pages, layouts, route handlers, and dashboard surfaces

components/
  UI components and feature views

lib/actions/
  Server actions for user-triggered mutations

lib/contracts/
  Contract domain logic, workflow rules, imports, exports, reminders, evidence, lifecycle, and queries

lib/auth.ts
lib/auth-guards.ts
  Active user, active organization, role, permission, and shipped-action checks

lib/billing/
  Plan policy, provider policy, Paddle provider integration, entitlements, and billing access gates

lib/intelligence/
  Activated intelligence surfaces for financial, procurement, and risk workflows

lib/supabase/
  Supabase clients and generated database types

supabase/migrations/
  Database schema, RLS policies, indexes, operational tables, and workflow fields

tests/
  Vitest test suite

e2e/
  Playwright release-critical journeys

docs/
  Current product truth, release scope, future references, security, testing, and operational notes

deferred/
  Non-shipped implementation sketches

legacy/
  Quarantined legacy code
```

## Important Architectural Rule

The shipped runtime must not quietly absorb every future idea.

Use these boundaries:

```text
core runtime       = shipped renewal and notice control
intelligence       = activated add-on surfaces with entitlement checks
deferred           = future implementation sketches, not runtime
legacy             = quarantined historical code, not runtime
docs/reference     = planning and strategy, not runtime behavior
revenue-intel      = future/internal module, separate from contracts
```

If a feature does not support the current renewal-control loop, it should not be added to the core runtime without an explicit activation decision.

## Repository Structure

Representative structure:

```text
.
|-- app/
|   |-- api/
|   |-- auth/
|   |-- dashboard/
|   |-- internal/
|   `-- (marketing)/
|-- components/
|   |-- admin/
|   |-- billing/
|   |-- contracts/
|   |-- dashboard/
|   |-- forms/
|   |-- layout/
|   `-- ui/
|-- deferred/
|-- docs/
|-- e2e/
|-- legacy/
|-- lib/
|   |-- actions/
|   |-- ai/
|   |-- analytics/
|   |-- billing/
|   |-- commercial/
|   |-- contracts/
|   |-- errors/
|   |-- extractors/
|   |-- intelligence/
|   |-- internal/
|   |-- notifications/
|   |-- ocr/
|   |-- organization/
|   |-- product/
|   |-- supabase/
|   `-- validation/
|-- scripts/
|-- supabase/
|   `-- migrations/
`-- tests/
```

## Core Domains

### Contracts

The contract domain owns:

- contract records
- contract files
- metadata
- review status
- evidence snippets
- owner assignment
- lifecycle state
- counterparty normalization
- import jobs
- export rows
- reminder-driving fields

Important concepts:

- P0 fields are the minimum renewal-control fields required for trusted reminders.
- Low-confidence or unsupported values require review.
- Manual values without evidence are treated carefully.
- Reminder-driving changes must remain auditable.
- Contract state transitions should go through domain logic, not ad hoc updates.

### Reminders

The reminder domain owns:

- reminder schedule policy
- reminder activation requirements
- reminder retry behavior
- notification logs
- reminder runs
- acknowledgment flow
- decision request flow

Reminder trust is a product feature. A reminder should not be treated as trusted just because a date exists. It should depend on review state, ownership, evidence, and workflow status.

### Authentication And Authorization

The application uses Supabase Auth and an active organization context.

Important rules:

- dashboard access requires an authenticated user
- most runtime work requires an active organization
- every organization-scoped object must be checked against the active organization
- customer-facing roles are normalized through the product role model
- shipped runtime actions are checked through the action matrix
- middleware is only a coarse redirect layer, not the source of authorization truth

Key authorization ideas:

- role checks decide whether a user may perform an action type
- object checks decide whether the object belongs to the active organization
- entitlement checks decide whether the organization has paid access to a capability
- audit logs should record denied and successful trust-sensitive actions

### Billing And Entitlements

The shipped-first runtime uses Paddle for self-serve billing.

Billing controls include:

- plan tiers
- subscription status
- trial state
- feature access
- tracked-contract limits
- export access
- multi-recipient reminder access
- intelligence surface access
- billing denial audit logs

Legacy Stripe and PayPal code is quarantined and should not become active shipped runtime unless deliberately reactivated.

### Intelligence

The intelligence layer supports risk, financial, and procurement views where activated.

Current intelligence rules should remain conservative:

- entitlement-gated
- role-gated
- owner-scoped where appropriate
- explainable
- auditable
- based on available workflow data
- clear about trust level and missing data

Intelligence must not invent certainty. If underlying contract data is incomplete or low-trust, intelligence output should say so.

### Audit

Audit logging is central to the product.

Audit logs should cover:

- extraction previews
- review completion
- reminder creation and regeneration
- reminder acknowledgment
- renewal decisions
- exports
- denied permission attempts
- billing feature denials
- internal operations
- destructive operations
- workspace deletion
- AI-generated or AI-reviewed outputs where future modules add them

### Internal Operations

Internal routes exist for:

- health checks
- OCR jobs
- operations snapshots
- backup readiness
- restore drills
- workspace deletion

These routes are machine or operator sensitive. They must stay secret-protected and should not leak customer data or operational details to unauthorized users.

Destructive operations require stronger controls than ordinary internal health checks.

## Database Overview

The application uses Supabase Postgres migrations.

Core tables include:

- `users`
- `organizations`
- `memberships`
- `contracts`
- `contract_files`
- `contract_metadata`
- `reminders`
- `notification_logs`
- `audit_logs`
- `notes`
- `exports`
- `counterparties`
- `counterparty_aliases`
- `contract_templates`
- `renewal_decisions`
- `import_jobs`
- `extracted_field_evidence`
- `processing_errors`
- `reminder_runs`
- `billing_webhook_events`
- `data_export_requests`
- `deletion_requests`
- `backup_readiness_checks`
- `ocr_jobs`
- `analytics_events`
- operational readiness, capacity, profitability, and health snapshot tables

Database rules:

- tenant data must be scoped by `organization_id`
- RLS must remain enabled for tenant tables
- privileged service-role access must manually enforce organization scope
- migrations should be additive once shared
- new tables need indexes for common access paths
- sensitive workflow tables need auditability

## AI Extraction

The current AI extraction flow uses OpenAI structured output through a Zod schema.

Extraction rules:

- never fabricate values
- unsupported or unclear fields should be null
- confidence should be low when evidence is weak
- source snippets should ground extracted values
- reminder suggestions must be operational, not legal advice
- human review remains required where confidence or support is insufficient

Future AI improvements should add:

- prompt version tracking
- model version tracking
- extraction job records
- source evidence records
- QA review records
- human approval state
- cost tracking
- retry/idempotency controls
- stricter privacy and retention policy for raw document text

## Internal Revenue Intelligence And Outreach Module

An internal Revenue Intelligence and Personalized Outreach Engine is a valid future module, but it should not be mixed into the core renewal workflow.

Recommended internal MVP:

```text
Product/Offer Library
-> ICP Profile
-> Lead/Company CSV Import
-> Fit Rationale
-> Compliance Check
-> AI Draft Generation
-> AI QA Review
-> Human Approval
-> Export
-> Outcome Tracking
```

Do not start with automatic sending.

The first internal version should help the founder/operator sell existing products with disciplined, lower-risk personalization. It should not become a bulk spam tool.

Recommended future module structure:

```text
app/dashboard/revenue/
components/revenue/
lib/revenue/products/
lib/revenue/icp/
lib/revenue/leads/
lib/revenue/compliance/
lib/revenue/messages/
lib/revenue/qa/
lib/revenue/campaigns/
lib/revenue/outcomes/
tests/revenue-*.test.ts
supabase/migrations/*revenue_intelligence*.sql
```

Non-negotiable controls:

- suppression list
- opt-out status
- source URL and source evidence
- legal basis or review status
- no invented facts
- no gender assumptions
- no auto-send before approval
- QA score before approval
- final approved message stored separately from draft
- outcome tracking
- country and language awareness

## Environment Variables

Create a local environment file based on `.env.example`.

Representative variables:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=contract-files

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

RESEND_API_KEY=
RESEND_FROM_EMAIL=notifications@noticecontrol.com
RESEND_WEBHOOK_SIGNING_SECRET=
NOTICECONTROL_REPLY_TO_EMAIL=support@noticecontrol.com
NOTICECONTROL_SENDING_DOMAIN=noticecontrol.com
NOTICECONTROL_EMAIL_ACTION_SECRET=

CRON_SHARED_SECRET=

PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
PADDLE_ENVIRONMENT=sandbox
PADDLE_STARTER_PRICE_ID=
PADDLE_GROWTH_PRICE_ID=

INTERNAL_HEALTH_SECRET=
INTERNAL_OCR_JOBS_SECRET=
INTERNAL_OPERATIONS_SECRET=
INTERNAL_DESTRUCTIVE_OPS_SECRET=
INTERNAL_DESTRUCTIVE_OPS_SIGNING_SECRET=
INTERNAL_OPERATOR_ALLOWLIST=
```

Never commit real secrets.

## Local Development

Install dependencies:

```bash
npm ci
```

Run the development server:

```bash
npm run dev
```

Run typecheck:

```bash
npm run typecheck
```

Run lint:

```bash
npm run lint
```

Run the default test suite:

```bash
npm run test
```

The app expects a configured Supabase project or compatible local Supabase setup. Database migrations and generated types should be kept in sync when schema changes.

## Test Commands

The repository has targeted test gates. Use the smallest relevant gate for the change, then broader gates before release.

```bash
npm run test
npm run test:trust-sensitive
npm run test:billing-control-plane
npm run test:permission-boundaries
npm run test:data-integrity
npm run test:ops-readiness
npm run test:intelligence-release-gate
npm run test:release-critical
npm run test:scope-freeze
```

Browser tests:

```bash
npm run e2e
npm run e2e:p0
npm run e2e:p0:required
```

Release checks:

```bash
npm run release:check
npm run smoke:staging
```

## Recommended Test Gate By Change Type

| Change type | Minimum relevant gate |
| --- | --- |
| Auth, active org, roles, permissions | `npm run test:permission-boundaries` |
| Billing, plans, entitlements, webhooks | `npm run test:billing-control-plane` |
| Contract import, review, reminders, workflow | `npm run test:data-integrity` |
| Internal operations | `npm run test:ops-readiness` |
| Intelligence features | `npm run test:intelligence-release-gate` |
| Product boundary or deferred/runtime rules | `npm run test:scope-freeze` |
| Release-critical changes | `npm run test:release-critical` |
| P0 browser journeys | `npm run e2e:p0:required` |

## CI And Release Readiness

GitHub Actions run Node CI on pushes and pull requests to main/master.

The quality workflow includes:

- install dependencies
- lint
- typecheck
- test
- trust-sensitive gate
- billing control-plane gate
- permission-boundary gate
- data-integrity gate
- internal ops readiness gate

Release readiness is manually triggered with:

- target environment
- smoke owner
- rollback owner

Release readiness includes:

- release ownership metadata check
- release-critical automated gates
- intelligence release gate
- required P0 browser release journeys
- production-like staging smoke

## Security Model

Security-sensitive principles:

- RLS protects tenant tables for user-scoped access
- service-role access bypasses RLS and must be manually scoped
- internal routes require specific secrets
- destructive internal operations require stronger signing controls
- webhook handlers must verify signatures
- billing and export actions are entitlement-gated
- object-level actions must verify organization ownership
- sensitive errors should be sanitized before returning to users
- audit logs should record sensitive actions and denials

High-risk areas to review carefully:

- service-role Supabase queries
- internal routes
- billing webhooks
- export routes
- reminder send routes
- OCR jobs
- workspace deletion
- AI extraction and generated output
- future outreach or email-sending modules

## Known Architecture Risks

The codebase has strong foundations, but the main risks are:

1. Oversized server-action files.
2. Runtime imports from broad commercial/strategy modules.
3. Potential overlap between shipped runtime, intelligence, deferred, and future reference material.
4. Heavy service-role usage without a hard scoped wrapper.
5. Query-layer duplication between shipped kernel and broader contract analytics.
6. Future add-ons being added directly to the core contract workflow.
7. Strategy documents becoming executable runtime logic.

Recommended near-term refactors:

- split large contract server actions by workflow
- create a privileged Supabase access wrapper that requires organization scope
- separate runtime commercial policy from strategy/reference content
- decide which intelligence surfaces are shipped versus add-on
- create a dedicated module boundary for future revenue intelligence
- make agent rules explicit in `AGENTS.md`

## Agent-Assisted Development Rules

AI coding agents should be treated as junior or mid-level developers.

Agents may:

- implement scoped tickets
- add tests
- refactor inside an approved boundary
- update docs
- explain tradeoffs

Agents must not:

- make architecture decisions alone
- add dependencies without justification
- change auth, billing, or schema semantics without approval
- activate deferred modules without approval
- duplicate existing logic
- bypass tests
- weaken permission checks
- add automatic outreach or sending behavior without compliance controls

Before editing, agents should inspect:

- `README.md`
- `SHIPPED_KERNEL.md`
- `SHIPPED_FIRST_SCOPE.md`
- `docs/CURRENT_PRODUCT_TRUTH.md`
- `DEFERRED_CAPABILITIES.md`
- relevant `lib/product/*` files
- relevant tests
- relevant migrations

## Contribution Guidelines

Every meaningful pull request should explain:

- objective
- product scope impact
- files changed
- behavior changed
- tests run
- authorization/security impact
- database migration impact
- billing/entitlement impact
- rollback considerations

Preferred PR size:

- one workflow
- one domain refactor
- one bug fix
- one add-on foundation slice

Avoid large mixed PRs that combine product scope, schema changes, UI changes, billing changes, and test rewrites.

## Documentation Map

Important docs:

- `README.md`: project overview and operating guide
- `SHIPPED_KERNEL.md`: the shipped product loop
- `SHIPPED_FIRST_SCOPE.md`: shipped-first capability boundary
- `docs/CURRENT_PRODUCT_TRUTH.md`: current product truth
- `DEFERRED_CAPABILITIES.md`: deferred capability registry
- `FUTURE_ACTIVATION_RULES.md`: rules for activating future modules
- `EARLY_RBAC.md`: role and permission direction
- `PHASE1_DEFINITION_OF_DONE.md`: phase-one release expectations
- `PHASE1_RELEASE_CRITICAL.md`: release-critical scope
- `RELEASE_QUALITY_GATES.md`: quality gates
- `docs/reference/`: future, strategy, historical, and operating-system reference material

Planning documents should clearly state whether they are:

- shipped
- deferred
- reference-only
- legacy
- internal-only

## Commercial And Internal Use

The current app can support both commercial SaaS direction and internal operating-system direction, but those should not be confused.

For commercial SaaS:

- keep the shipped kernel narrow
- prove repeatable customer value
- reduce support burden
- maintain billing and entitlement discipline
- document security and operational controls

For internal tooling:

- move faster
- keep modules separate
- preserve auditability
- avoid automatic high-risk actions
- use the tool to improve founder/operator execution

The internal Revenue Intelligence module is best treated as an internal add-on first. If it proves useful, it can later become a commercial module.

## Roadmap Principles

Good expansion:

- solves a real workflow problem
- has a clear owner and module boundary
- has a database model
- has permissions
- has audit logs
- has tests
- can be disabled without breaking the core
- improves operational leverage

Bad expansion:

- adds code only to look bigger
- mixes unrelated domains
- duplicates existing logic
- weakens tenant isolation
- bypasses review
- creates UI without a real workflow
- turns strategy notes into runtime dependencies
- ships automatic outbound behavior before compliance controls exist

## License

This repository is private unless a license is added.
