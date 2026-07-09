# P0 E2E Staging Setup

This is the release fixture contract for `npm run e2e:p0:required`. The suite proves the shipped renewal-control loop against a live staging app. It must not depend on deferred modules, manual fixture guessing, or production customer data.

For a short fixture-contract pointer, see [P0_E2E_STAGING_FIXTURES.md](P0_E2E_STAGING_FIXTURES.md). This setup document remains the canonical source of truth.

## Required Staging Users

- Primary owner/admin user: belongs to the primary test organization and can access dashboard, create manual contracts, review P0 fields, export contracts, open pricing/billing, and record renewal decisions.
- Secondary org user: belongs to a different organization and is used only to prove cross-org contract denial.
- Optional member user: belongs to the primary organization with non-admin permissions and is used to prove admin-surface denial when `E2E_MEMBER_AUTH_COOKIE_VALUE` is available.

## Required Organizations And Roles

- Primary organization: seeded with the primary owner/admin and, ideally, at least one selectable owner/member so manual contract owner assignment can be exercised.
- Secondary organization: seeded with the secondary user and at least one foreign contract that the primary organization must not be able to access.
- Roles: primary user should be owner/admin; secondary user can be any authenticated role in the secondary organization; optional member user should not have admin privileges.

## Required Seeded Contracts

- Review contract: a primary-organization contract reachable via `E2E_REVIEW_CONTRACT_PATH`, such as `/dashboard/contracts/{primary-contract-id}`. It must allow review correction and reminder regeneration assertions.
- Foreign contract denial path: a contract path reachable via `E2E_FOREIGN_CONTRACT_PATH`, such as `/dashboard/contracts/{primary-contract-id}`, that the secondary org session must not be able to access. This path proves cross-org denial.
- Manual contract entry: no pre-created contract is required for the main P0 flow, but the primary account must be allowed to create a manual contract.

## Required Environment

- `E2E_BASE_URL` or `NEXT_PUBLIC_APP_URL`: staging app URL.
- `E2E_AUTH_COOKIE_NAME`: auth cookie name for the app session.
- `E2E_AUTH_COOKIE_VALUE`: primary owner/admin auth cookie value.
- `E2E_SECONDARY_AUTH_COOKIE_VALUE`: secondary organization auth cookie value.
- `E2E_REVIEW_CONTRACT_PATH`: seeded primary review contract path.
- `E2E_FOREIGN_CONTRACT_PATH`: seeded foreign contract path.
- `E2E_MEMBER_AUTH_COOKIE_VALUE`: optional member auth cookie for admin-denial proof.

## Cookie Refresh

1. Sign in to staging as each fixture user.
2. Copy the current app auth cookie value from the browser devtools application/cookies panel.
3. Store refreshed values in the release environment secrets, not in repository files.
4. Rotate these cookies whenever the staging session expires, users are reseeded, or auth/session settings change.

## Running Locally

Use optional mode for local smoke work:

```bash
npm run e2e:p0
```

Optional mode exits cleanly if base URL or auth cookies are missing.

Use required mode for release evidence:

```bash
npm run e2e:p0:required
```

Required mode fails before Playwright starts if required staging/auth/seeded path inputs are missing.

To verify staging fixtures without launching Playwright:

```bash
npm run e2e:p0:verify
```

The verifier is read-only. It sends authenticated `GET` requests to the staging app and checks:

- staging base URL does not return a server error
- primary cookie reaches `/dashboard`
- primary cookie reaches `E2E_REVIEW_CONTRACT_PATH`
- secondary cookie is denied or protected at `E2E_FOREIGN_CONTRACT_PATH`
- member cookie is denied from `/dashboard/admin` when configured

The verifier rejects malformed cookie names, unsafe cookie values, non-HTTP base URLs, and cross-origin fixture paths before Playwright starts. Cookie values are never printed. Error messages redact configured cookie values before they reach stdout/stderr.

## Running In CI

The release-readiness workflow expects the required values as environment secrets/variables. `npm run release:strict` runs lint, typecheck, release-critical tests, release metadata validation, and required P0 E2E.

## Current Manual Step

There is not yet a committed staging seed automation script for these users and contracts. Until that exists, staging fixture creation and cookie refresh are an explicit release operation. The verifier confirms that the manually seeded staging state is usable before Playwright starts.
