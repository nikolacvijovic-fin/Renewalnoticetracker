# Phase 3 E2E Setup

These tests exercise release-critical flows against a live app instance.

For the exact staging fixture contract, see [P0 E2E staging setup](../docs/P0_E2E_STAGING_SETUP.md).

## Required environment

- `E2E_BASE_URL` or `NEXT_PUBLIC_APP_URL` pointing to a running app.
- `E2E_AUTH_COOKIE_NAME` and `E2E_AUTH_COOKIE_VALUE` for an authenticated owner/admin session.
- `E2E_SECONDARY_AUTH_COOKIE_VALUE` for a second org session used to prove cross-org denial.
- `E2E_REVIEW_CONTRACT_PATH` for a seeded contract that can exercise review correction and reminder regeneration.
- `E2E_FOREIGN_CONTRACT_PATH` for a seeded contract outside the primary org used to prove cross-org denial.
- Optional: `E2E_MEMBER_AUTH_COOKIE_VALUE` for a member session used to prove admin-route denial.
- `RESEND_FROM_EMAIL=notifications@noticecontrol.com`
- `NOTICECONTROL_SENDING_DOMAIN`
- `NOTICECONTROL_REPLY_TO_EMAIL`
- `RESEND_WEBHOOK_SIGNING_SECRET`

## Running the tests

1. Start the app (`npm run dev`) with a real database and billing config.
2. Export the required environment variables.
3. Run `npm run e2e:p0` for the optional local P0 pass.
4. Run `npm run e2e:p0:verify` to check staging fixtures without launching Playwright.
5. Run `npm run e2e:p0:required` in release/staging contexts where auth fixtures must exist.

## Notes

- `npm run e2e:p0` is local-friendly and exits cleanly if auth fixtures are missing.
- `npm run e2e:p0:verify` is read-only and validates staging fixture reachability before browser execution.
- `npm run e2e:p0:required` is release-grade and fails if auth or seeded review/cross-org fixtures are missing.
- `npm run release:check` must pass before `e2e:p0:required` counts as release evidence.
- shipped-first browser proof should target the vendor-side reminder loop, Paddle checkout, export flow, and internal-route denial only.
- do not add deferred capability expectations to Phase 1 P0 coverage.
- the main P0 renewal workflow uses manual contract entry so the browser test proves contract creation, P0 review, reminder-backed state, and renewal decision without depending on OCR or extraction fixtures.
- seeded release/staging accounts for required P0 runs should have manual contract entry available, at least one selectable owner, and permission to record renewal decisions.
- CI can run the required P0 suite once a staging app URL plus seeded auth cookies and contract paths are supplied as secrets; without those inputs, required mode fails loudly instead of silently skipping release-critical coverage.
