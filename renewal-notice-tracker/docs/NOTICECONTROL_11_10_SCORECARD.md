# NoticeControl 11/10 Shipped-Kernel Scorecard

This scorecard is the final shipped-kernel inspection surface for NoticeControl Phase 1.

Rule:
- no area counts as `11/10` without code, docs, and blocking tests that prove it
- a green area means the shipped kernel has enforceable evidence, not aspirational language
- deferred or reference material does not raise the score of shipped runtime

## Scope Purity

Current status:
- Pass with evidence. The shipped runtime is narrowed to the vendor-side renewal-control loop and current-scope docs reject deferred feature language.

Pass condition:
- customer-visible runtime only supports upload/import, P0 review, owner assignment, trusted reminders, acknowledgment, decision, closure, safe tiered export presets, minimal settings, and narrow reporting

Blocking tests:
- `tests/current-product-truth-docs.test.ts`
- `tests/shipped-first-docs.test.ts`
- `tests/shipped-kernel-registry.test.ts`

Owning files:
- `lib/product/shipped-kernel.ts`
- `SHIPPED_KERNEL.md`
- `docs/CURRENT_PRODUCT_TRUTH.md`

What is not allowed:
- playbooks, custom reminder rules, monthly digest, Slack/Teams, native calendar sync, broad admin/debug, analytics theater, or packaging strategy as active shipped runtime

## Deferred Isolation

Current status:
- Pass with evidence. Deferred capabilities are preserved but powerless from shipped runtime.

Pass condition:
- shipped runtime folders do not import deferred, legacy, or reference modules except the explicit registry allowlist

Blocking tests:
- `tests/deferred-import-boundary.test.ts`
- `tests/deferred-capabilities-registry.test.ts`
- `tests/shipped-kernel-boundary.test.ts`

Owning files:
- `lib/product/deferred-capabilities.ts`
- `docs/DEFERRED_IMPORT_BOUNDARY.md`
- `deferred/`
- `legacy/`

What is not allowed:
- shipped `app/`, `components/`, or `lib/` importing deferred modules as active runtime dependencies

## Active-Org Safety

Current status:
- Pass with evidence. One canonical active-organization model exists and cross-org denial is tested.

Pass condition:
- shipped routes, server actions, exports, billing, and settings resolve the active org through the canonical auth context and reject inactive-org object access

Blocking tests:
- `tests/auth-context.test.ts`
- `tests/settings-actions-authz.test.ts`
- `tests/ics-route.test.ts`
- `tests/contract-queries-authz.test.ts`

Owning files:
- `lib/auth.ts`
- `app/dashboard/settings/page.tsx`
- `app/dashboard/contracts/[id]/ics/route.ts`

What is not allowed:
- trusting `organization_id` from request body or headers without membership validation

## Action-Level RBAC

Current status:
- Pass with evidence. Trust-sensitive shipped actions flow through the canonical shipped action matrix.

Pass condition:
- every shipped trust-sensitive mutation or export enforces active-org, role, and object-level checks through the canonical action gate

Blocking tests:
- `tests/permissions.test.ts`
- `tests/contract-actions-tenant.test.ts`
- `tests/trust-sensitive-routes.test.ts`
- `tests/billing-routes.test.ts`

Owning files:
- `lib/product/action-matrix.ts`
- `lib/auth.ts`
- `lib/actions/contracts.ts`
- `app/api/extract/route.ts`
- `app/api/reminders/route.ts`

What is not allowed:
- direct sensitive mutation without action-matrix enforcement

## P0 Review Trust

Current status:
- Pass with evidence. Dirty review flags force Exception Review and typed reasons are enforced server-side.

Pass condition:
- no dirty review case can become Fast Review, and review mode is deterministic, explainable, and auditable

Blocking tests:
- `tests/phase1-pilot.test.ts`
- `tests/review-validation.test.ts`
- `tests/review-form.test.tsx`

Owning files:
- `lib/contracts/phase1-pilot.ts`
- `lib/validation/contract.ts`
- `components/contracts/review-form.tsx`

What is not allowed:
- low-confidence, OCR-assisted, conflict, derived-date, or changed-verified-P0 review flowing through Fast Review

## Reminder Gating

Current status:
- Pass with evidence. Trusted reminders are review-gated and owner-gated with explicit blocked states.

Pass condition:
- no reminder schedule activates until reviewed P0 truth, owner assignment, and required P0 dates are present

Blocking tests:
- `tests/reminder-policy.test.ts`
- `tests/phase1-workflow-actions.test.ts`
- `tests/contract-lifecycle.test.ts`

Owning files:
- `lib/contracts/shipped-reminder-policy.ts`
- `lib/contracts/reminder-policy.ts`
- `lib/contracts/lifecycle.ts`

What is not allowed:
- `needs_review` moving into trusted reminder scheduling without a validated review-completion path

## Reminder Reliability Visibility

Current status:
- Pass with evidence. Reminder lifecycle and failure states are visible to operators and internal support.

Pass condition:
- scheduled, sent, failed, retrying, terminal failure, superseded, blocked-by-review, blocked-by-missing-owner, acknowledgment, and decision states are inspectable

Blocking tests:
- `tests/reminder-control-plane.test.ts`
- `tests/review-reminder-regeneration.test.ts`
- `tests/admin-panel.test.tsx`

Owning files:
- `lib/notifications/reminders.ts`
- `components/contracts/reminder-timeline.tsx`
- `components/admin/admin-panel.tsx`

What is not allowed:
- retries hiding failure, duplicate processing spamming silently, or support lacking lifecycle visibility

## Email Safety

Current status:
- Pass with evidence. Reminder email content is escaped and action links are signed, expiring, and server-validated.

Pass condition:
- email cannot mutate workflow through replies, injected HTML, or unsigned/expired/wrong-org action links

Blocking tests:
- `tests/email-policy.test.ts`
- `tests/email-action-tokens.test.ts`
- `tests/email-actions.test.ts`
- `tests/email-action-route.test.ts`

Owning files:
- `lib/email/policy.ts`
- `lib/email/action-tokens.ts`
- `lib/email/actions.ts`
- `app/api/email-actions/[action]/[token]/route.ts`

What is not allowed:
- raw query-intent links, HTML injection, or reply-to acknowledgments

## Import Honesty

Current status:
- Pass with evidence. Fixed-template import creates reviewable data with row-level truth instead of fake trust.

Pass condition:
- import enforces the fixed template, returns row-level results, creates review queue records, and never creates trusted reminders directly

Blocking tests:
- `tests/import-action.test.ts`
- `tests/import-parser.test.ts`
- `tests/import-normalize.test.ts`
- `tests/import-error-report-route.test.ts`

Owning files:
- `lib/contracts/import.ts`
- `lib/contracts/import-jobs.ts`
- `app/dashboard/contracts/import-template/route.ts`

What is not allowed:
- import creating trusted reminders or silently smoothing over bad rows

## Counterparty Normalization

Current status:
- Pass with evidence. Counterparty cleanup is limited to vendor identity cleanup for renewal control.

Pass condition:
- raw and normalized names are preserved, aliases and duplicate suggestions work, merge is auditable, and cross-org merge is denied

Blocking tests:
- `tests/counterparty-normalization.test.ts`
- `tests/counterparty-merge-action.test.ts`
- `tests/counterparty-directory.test.tsx`

Owning files:
- `lib/contracts/counterparty-normalization.ts`
- `lib/contracts/counterparty-summaries.ts`
- `components/contracts/counterparty-directory.tsx`

What is not allowed:
- turning counterparty cleanup into a broad CRM or contact-directory product

## Billing Purity

Current status:
- Pass with evidence. Billing is Paddle-first for self-serve, manual invoice / wire transfer and PayPal are support-led exceptions, and Stripe is legacy migration-only.

Pass condition:
- shipped runtime exposes Paddle self-serve only, manual invoice / wire transfer and PayPal are support-led, exception-billed entitlements come from canonical billing snapshot state, and legacy provider routes do not behave as active product

Blocking tests:
- `tests/billing-provider.test.ts`
- `tests/billing-routes.test.ts`
- `tests/billing-webhooks.test.ts`
- `tests/settings-billing-ui.test.tsx`

Owning files:
- `lib/billing/provider-policy.ts`
- `app/api/billing/checkout/route.ts`
- `app/api/billing/manage/route.ts`
- `legacy/billing/`

What is not allowed:
- provider-neutral billing language, public PayPal checkout parity, fake support-led billing portals, or active Stripe parity in shipped runtime

## Internal Ops Minimalism

Current status:
- Pass with evidence. Internal runtime is a rescue console, not a second product.

Pass condition:
- internal runtime shows rescue state only: reminder failures, retrying reminders, extraction/import failures, billing exceptions, operational traces, and audited rescue actions

Blocking tests:
- `tests/internal-ops-page.test.tsx`
- `tests/admin-panel.test.tsx`
- `tests/admin-actions.test.ts`
- `tests/ops-snapshots-route.test.ts`

Owning files:
- `app/internal/ops/page.tsx`
- `components/admin/admin-panel.tsx`
- `lib/internal/ops-queries.ts`

What is not allowed:
- readiness, capacity, profitability, GTM, package, or customer-health runtime surfaces

## Analytics Minimalism

Current status:
- Pass with evidence. Phase 1 runtime emits only the small shipped event taxonomy.

Pass condition:
- shipped runtime can emit only the approved Phase 1 events and cannot import future analytics event sets

Blocking tests:
- `tests/phase1-event-taxonomy.test.ts`
- `tests/analytics-runtime.test.ts`

Owning files:
- `lib/analytics/phase1-events.ts`
- `lib/analytics/future-events.ts`
- `docs/PHASE1_EVENT_TAXONOMY.md`

What is not allowed:
- digest, playbook, custom-rule, health-score, profitability, Slack/Teams, or calendar-sync events in shipped runtime

## Release-Critical Proof

Current status:
- Pass with evidence. The release gate is narrow, shipped-loop-specific, and split away from future/reference suites.

Pass condition:
- `test:release-critical` proves only the shipped weekly loop and excludes future/reference suites

Blocking tests:
- `tests/release-gates.test.ts`
- `tests/release-script-boundary.test.ts`

Owning files:
- `PHASE1_RELEASE_CRITICAL.md`
- `PHASE1_RELEASE_TEST_MATRIX.md`
- `package.json`

What is not allowed:
- broad readiness, profitability, digest, playbook, or future analytics suites defining release proof

## Founder-Autonomy Gate

Current status:
- Pass with evidence, but still requires human release judgment. The autonomy checklist is encoded as a release blocker.

Pass condition:
- the normal operator loop can run without hidden founder rescue, and the repo carries the explicit autonomy gate as release evidence

Blocking tests:
- `tests/two-week-autonomy-gate.test.ts`
- `tests/release-gates.test.ts`

Owning files:
- `docs/TWO_WEEK_AUTONOMY_GATE.md`
- `PHASE1_DEFINITION_OF_DONE.md`
- `scripts/phase1-release-gates.mjs`

What is not allowed:
- founder manually fixing imports silently, manually triggering reminders, live-interpreting review state, or editing DB/admin data outside audited rescue

## How To Use This Scorecard

This scorecard is inspectable only if all of the following stay true:
- every section names its blocking tests
- every section names owning files
- every section names what is forbidden
- no section claims `11/10` from narrative alone

If any area loses its tests, owning files, or current shipped-runtime evidence, it drops below release-grade immediately.
