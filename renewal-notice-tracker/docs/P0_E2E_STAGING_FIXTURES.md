# P0 E2E Staging Fixtures

The canonical fixture contract lives in [P0_E2E_STAGING_SETUP.md](P0_E2E_STAGING_SETUP.md).

This short file exists so release work, CI notes, and future agents have a stable place to look when they search for "P0 E2E staging fixtures." Keep the setup document as the single source of truth for required users, roles, contract paths, cookies, and verifier behavior.

Current policy:

- `npm run e2e:p0:verify` is read-only and does not create staging data.
- `npm run e2e:p0:required` runs the verifier before Playwright starts.
- Cookie values and auth secrets must be provided through local environment variables or CI secrets and must never be committed.
- The verifier rejects malformed cookie/header configuration and cross-origin contract paths before any browser run.
- Automated staging fixture seeding remains a future ticket; until then, fixture creation and cookie rotation are explicit release operations.
