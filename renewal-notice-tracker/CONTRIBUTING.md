# NoticeControl Contributor Guide

This guide is the practical path for changing NoticeControl without weakening the shipped kernel.

## Local Setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill local Supabase, Paddle, email, OCR, and internal-route values with development secrets only.
4. Start the app with `npm run dev`.

Do not commit real secrets, provider payloads, uploaded documents, raw OCR output, or extracted contract text.

## Environment Variables

Configuration is centralized through `lib/config.ts`. Treat environment variables as runtime contract, not incidental globals.

High-level groups:
- App and auth: app URL, Supabase URL, anon key, service-role key.
- Storage: contract file bucket.
- Email: Resend key, from/reply-to addresses, email-action secret.
- OCR/jobs: OCR provider, OpenAI/OCR keys and models.
- Billing: Paddle API key, webhook secret, environment, price IDs.
- Internal routes: separate health, OCR job, operations, destructive, destructive signing, and operator allowlist values.

Use `.env.example` for names. Never paste real values into docs, tests, logs, or issue comments.

## Common Commands

- Typecheck: `npm run typecheck`
- All unit tests: `npm run test`
- Release-critical shipped loop: `npm run test:release-critical`
- Release-critical CI plus required P0 E2E: `npm run test:release-critical:ci`
- Intelligence release gate: `npm run test:intelligence-release-gate`
- E2E tests: `npm run e2e`
- Required P0 E2E: `npm run e2e:p0:required`
- Future/reference suites: `npm run test:future-reference`

When a change touches a high-risk domain, run the narrow relevant script first, then the broader gate before release.

## Adding A New API Route Safely

Use `createRouteHandler` from `lib/http` for routes with auth, writes, billing, internal secrets, exports, OCR, reminders, contracts, intelligence, or billing data.

Required shape:
- Put auth in `auth`.
- Put body/query validation in `parse`.
- Put business work in the handler.
- Return safe structured errors with codes.
- Use shared permission, billing, and org-scope helpers.
- Add named structured logs for operational failures.
- Add tests for auth failure, validation failure, safe error shape, and no payload read after denial.

Do not manually parse secrets or reimplement route error envelopes unless there is a documented reason.

## Adding A New Export Preset Safely

Export presets live in `lib/contracts/export.ts`.

For every new preset define:
- stable ID, label, description
- included sections
- required commercial feature or minimum plan
- allowed roles
- supported formats
- column definitions

Rules:
- Basic export must stay backward compatible and must not leak notes, intelligence, evidence, or audit logs.
- Sensitive sections must be opt-in through a gated preset.
- Spreadsheet injection sanitization must apply to every string field.
- Route access must deny before reading export payload.
- Update `docs/EXPORT_PRESETS.md` and export tests.

## Adding A New Intelligence Surface Safely

Intelligence access belongs in `lib/intelligence/access.ts`. Pages should ask the shared access model for a surface, not construct billing truth locally.

Rules:
- Use canonical billing snapshot access.
- Preserve organization scope and role/owner scope.
- Every output needs confidence/trust metadata.
- Passive render events must be view events, not recalculation events.
- Add cross-surface consistency tests when user-visible access changes.
- Update `docs/intelligence/*` release gate docs.

## Adding A Billing-Gated Feature Safely

Billing and commercial policy belong in `lib/billing/*` and shared entitlement helpers.

Rules:
- Do not read raw organization billing fields in pages or one-off routes.
- Use the canonical billing snapshot and entitlement result.
- Test free, starter, growth, expired trial, cancelled, and past-due states where relevant.
- Preserve current UX for redirects/denials.
- Audit sensitive denials where appropriate.

## Adding A Database Query Or Helper Safely

Business-sensitive Supabase access should live in focused query/helper modules, not page files.

Rules:
- Require `organization_id` scope on contract, export, reminder, billing, and intelligence reads.
- Use service-role clients only in explicit server/control-plane helpers.
- Use checked writes for privileged mutations.
- Avoid returning raw extraction payloads, full notes, or sensitive evidence unless the caller is explicitly authorized.
- Add tenant-isolation tests for helpers that read or mutate customer data.

## Updating Shipped And Deferred Boundaries

If a capability moves between shipped and deferred:
- Update `SHIPPED_KERNEL.md`, `DEFERRED_CAPABILITIES.md`, `NOT_SHIPPED_FIRST.md`, and relevant docs under `docs/`.
- Update registry files under `lib/product/*`.
- Update release scripts/tests if the release-critical proof changes.
- Do not promote Slack, Teams, monthly digest, playbooks, approvals, negotiation tracking, customer API, or full CLM without explicit shipped-kernel review.

Small changes should still leave a future contributor able to answer: what shipped, what is deferred, who can access it, how is it tested, and what must not leak?
