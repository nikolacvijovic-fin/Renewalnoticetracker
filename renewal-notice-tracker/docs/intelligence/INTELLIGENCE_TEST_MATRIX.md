# Intelligence Test Matrix

## Gate script

- `npm run test:intelligence-release-gate`
  - The dedicated release blocker suite for Financial Intelligence, Procurement Analytics, and AI Risk Scoring.

## Blocker coverage

| Release blocker | Test proof |
| --- | --- |
| financial values lack trust labels | `tests/financial-exposure.test.ts` |
| multi-currency values summed without policy | `tests/financial-exposure.test.ts` |
| risk score lacks reasons | `tests/risk-score.test.ts`, `tests/risk-explanation-drawer.test.tsx` |
| risk score lacks confidence level | `tests/risk-score.test.ts`, `tests/risk-queue-page.test.tsx` |
| risk score uses unreviewed data as high-confidence | `tests/risk-score.test.ts` |
| procurement metric lacks drilldown | `tests/procurement-query-helpers.test.ts`, `tests/procurement-analytics-page.test.tsx` |
| intelligence route lacks org/role checks | `tests/intelligence-access.test.ts`, `tests/financial-intelligence-page.test.tsx`, `tests/procurement-analytics-page.test.tsx`, `tests/risk-queue-page.test.tsx` |
| ai copy implies legal advice | `tests/risk-queue-page.test.tsx`, `tests/risk-explanation-drawer.test.tsx` |
| dashboard cannot name action it drives | `tests/financial-intelligence-page.test.tsx`, `tests/procurement-analytics-page.test.tsx`, `tests/risk-queue-page.test.tsx` |

## Supporting gate expectations

- All intelligence outputs have confidence metadata or trust metadata that explains output quality.
- All financial outputs have calculation basis.
- All risk scores have reasons.
- All procurement metrics drill down to contracts.
- All routes enforce org, role, and plan gates.
- No legal-advice copy appears in intelligence surfaces.

## CI expectation

The release-readiness workflow must run `npm run test:intelligence-release-gate` as a separate step. This keeps the intelligence gate explicit without pretending it is part of the narrower shipped-kernel `test:release-critical` loop.
