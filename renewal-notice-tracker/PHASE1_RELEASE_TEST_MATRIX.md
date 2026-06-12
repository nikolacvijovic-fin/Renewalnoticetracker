# Phase-1 Release Test Matrix

## Release-critical script

`npm run test:release-critical`

Sub-suites:

- `test:release-critical:session-org`
  - `tests/auth-callback-route.test.ts`
  - `tests/auth-context.test.ts`
  - `tests/settings-actions-authz.test.ts`
- `test:release-critical:authz`
  - `tests/permissions.test.ts`
  - `tests/contract-actions-tenant.test.ts`
  - `tests/contract-queries-authz.test.ts`
  - `tests/trust-sensitive-routes.test.ts`
  - `tests/scoped-admin.test.ts`
  - `tests/admin-actions.test.ts`
- `test:release-critical:intake-review`
  - `tests/import-action.test.ts`
  - `tests/import-parser.test.ts`
  - `tests/import-error-report-route.test.ts`
  - `tests/phase1-pilot.test.ts`
  - `tests/review-validation.test.ts`
  - `tests/review-form.test.tsx`
- `test:release-critical:workflow`
  - `tests/phase1-workflow-actions.test.ts`
  - `tests/review-reminder-regeneration.test.ts`
  - `tests/reminder-policy.test.ts`
  - `tests/reminder-logic.test.ts`
  - `tests/reminder-control-plane.test.ts`
  - `tests/send-reminders-route.test.ts`
  - `tests/contract-lifecycle.test.ts`
- `test:release-critical:exports`
  - `tests/export-routes.test.ts`
  - `tests/ics-route.test.ts`
- `test:release-critical:billing`
  - `tests/billing-provider.test.ts`
  - `tests/billing-routes.test.ts`
  - `tests/billing-webhooks.test.ts`
  - `tests/billing-service.test.ts`
  - `tests/settings-billing-ui.test.tsx`

## Future/reference script

`npm run test:future-reference`

This holds non-release suites that preserve deferred or reference material:

- `tests/monthly-digest-route.test.ts`
- `tests/support-economics.test.ts`
- `tests/conversion-strategy.test.ts`
- `tests/red-team-strategy.test.ts`
- `tests/unified-blueprint.test.ts`

## Why this split exists

Release-critical proof should answer only one question:

Can an actual customer safely run the shipped weekly renewal-control loop inside the correct organization boundary?

Future/reference suites are still useful, but they are not allowed to dilute the shipped release gate.

The release gate also requires the two-week operator autonomy checklist in [docs/TWO_WEEK_AUTONOMY_GATE.md](docs/TWO_WEEK_AUTONOMY_GATE.md).
