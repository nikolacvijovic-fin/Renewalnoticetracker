# Release Readiness Repair - 2026-08-27

This note records the release evidence and rollout boundary for the commercial comparison repair. It does not authorize deployment.

## Release decision

The code-level Node gates are green locally. Release remains **NO-GO** until both GitHub Actions workflows prove the Java 21 and disposable Supabase jobs and the repository owner resolves the visibility/licensing conflict.

The repository is public, while the root README states that it is private unless a license is added. The owner must choose one option before release:

1. Make the repository private for proprietary SaaS operation.
2. Deliberately keep it public, add an approved license, and complete a security and intellectual-property review.

No visibility or licensing change is included in this repair.

## Changes and controls

- Commercial comparison persistence now uses one database transaction with a stable idempotency key. A failed intermediate insert rolls back all business artifacts.
- Proposal uploads use explicit `pending`, `ready`, and `failed` lifecycle states. Failed extraction or comparison cannot leave a proposal usable, and storage cleanup is idempotent.
- One-time charges are separated from recurring annual cost and are counted exactly once in first-year and commitment totals.
- Proposal PDFs use the existing selective OCR provider path. Failed or low-confidence OCR remains review-required evidence.
- Customer export options now distinguish complete JSON/XLSX datasets from the partial leadership PDF and calendar-only ICS datasets.
- Production configuration remains strict. Placeholder configuration is accepted only when both `CI=true` and `NOTICECONTROL_CONFIG_VALIDATION_MODE=ci_build` are set for a compile-only CI build.
- Vitest worker concurrency is bounded to avoid nondeterministic resource exhaustion; no tests or assertions were skipped.

## Migration order

Apply migrations in filename order after all existing migrations through `202608260002_contract_quote_negotiation_intelligence.sql`:

1. `202608270001_atomic_commercial_comparison_persistence.sql`
2. `202608270002_commercial_proposal_upload_lifecycle.sql`

The first migration adds comparison idempotency, corrected cost fields, and the transactional persistence RPC. The second adds proposal upload lifecycle and content-fingerprint fields. Generated TypeScript database contracts were updated with the additive schema.

## Rollout and rollback

1. Back up the database and verify migration checksums before applying either migration.
2. Apply both migrations to an isolated Supabase environment and run the complete pgTAP suite.
3. Deploy application code only after the database tests, Java 21 tests, and Node workflow are green.
4. Exercise a native PDF, image-only PDF, failed OCR, forced comparison failure, and idempotent retry in staging.
5. Confirm no failed proposal is visible as ready and no retry duplicates comparison artifacts.

Rollback must not delete customer data:

- If application behavior regresses, roll back the application to the preceding release while leaving the additive columns, indexes, and RPC in place.
- Do not drop populated lifecycle or comparison columns. Correct database defects with a forward-only migration.
- If the new comparison path must be disabled, remove its application entry point or feature access in a forward deploy; retain persisted evidence for audit.
- Failed or pending proposal artifacts should be reconciled through the lifecycle cleanup path. Do not bulk-delete storage objects without matching organization-scoped database evidence.
- Re-enable the feature only after replaying an idempotency test against the repaired environment.

## Verification evidence

Local results on Windows:

- `npm ci`: passed using the committed lockfile. Its install summary reported 11 advisories: 3 moderate, 7 high, and 1 critical.
- Immediate `npm audit` and `npm audit --omit=dev` runs both reported zero vulnerabilities. This conflicts with the clean-install summary and must be rechecked in the Linux workflow before release.
- `npm run lint`: passed with no warnings or errors.
- `npm run typecheck`: passed.
- `npm test`: 298 files and 1,564 tests passed.
- `npm run test:scope-freeze`: 44 files and 256 tests passed.
- `npm run test:deployment-readiness`: 4 files and 44 tests passed.
- `npm run test:release-critical`: passed.
- `npm run test:permission-boundaries`: 181 tests passed.
- `npm run test:data-integrity`: 147 tests passed.
- `npm run test:billing-control-plane`: 24 tests passed.
- `npm run test:ops-readiness`: 128 tests passed.
- Python service tests: 27 tests passed; pytest reported a non-failing local cache-permission warning.
- `npm run build` with the explicit CI-build configuration: passed; 72 routes generated.

Not locally verified:

- Maven tests, because Java and Maven are not installed on the host. The workflow pins Temurin Java 21 and runs `mvn --batch-mode test`.
- Disposable Supabase integration, because the Supabase CLI is unavailable and the local Docker engine is not running. The workflow starts Supabase and executes the pgTAP suite.
- GitHub Actions conclusions, because this branch was not pushed and no deployment or remote workflow was triggered.

Dependency classification from the install/audit investigation:

- Runtime candidates requiring an upgrade plan: Next.js, `xlsx`, and the bundled/transitive PostCSS path. The available fixes involve a major framework upgrade or, for `xlsx`, no npm remediation in the current package line.
- Development-only candidates: Vitest/Vite/esbuild and ESLint/glob tooling. The critical advisory is in the test/build toolchain, not a deployed application dependency.
- No forced major-version upgrade was applied in this focused repair. The conflicting audit responses and runtime candidates remain a release-owner risk decision and should be reproduced on the pinned Node 20 Linux runner.

## Security review

The tracked-file scan found no real credentials, customer data, private keys, or developer-specific executable paths. Matches were limited to documented/test fixtures and a SCIM user-resource route placeholder, which is not a machine-local path. Secret values must never be copied into pull-request logs.

Tenant isolation remains enforced by organization-scoped repository calls and database validation. The transactional RPC is granted only to `service_role`, uses a fixed `search_path`, validates actor membership and organization/contract relationships, and is not exposed to browser callers.

## Required remote proof

Before changing the release decision to GO, both workflows must complete successfully on the repair branch:

- `Node CI`
- `Subscription Usage Multi-Runtime`, including Java 21, disposable Supabase integration, Python, fixture smoke, and the aggregate release gate
