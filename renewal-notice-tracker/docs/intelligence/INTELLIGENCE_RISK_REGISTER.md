# Intelligence Risk Register

This register tracks the ways the Intelligence Layer can become dashboard theater or unsafe product surface.

| Risk | Release blocker | Current control | Owning tests |
| --- | --- | --- | --- |
| Fake financial precision from untrusted values | financial values lack trust labels | Financial exposure helpers return trust level, warnings, and explainability metadata. | `tests/financial-exposure.test.ts` |
| False exposure totals across currencies | multi-currency values summed without policy | Mixed currencies block aggregation and emit warnings instead of a total. | `tests/financial-exposure.test.ts` |
| Opaque risk output | risk score lacks reasons | Risk scores must include explainable reasons for every band. | `tests/risk-score.test.ts`, `tests/risk-explanation-drawer.test.tsx` |
| Risk output overstates certainty | risk score lacks confidence level | Risk scores must include confidence level and missing-data warnings. | `tests/risk-score.test.ts`, `tests/risk-queue-page.test.tsx` |
| Unreviewed data looks fully trusted | risk score uses unreviewed data as high-confidence | Unreviewed P0 lowers confidence and emits review-pending warnings. | `tests/risk-score.test.ts` |
| Procurement metrics cannot lead to work | procurement metric lacks drilldown | Procurement helpers and pages must expose drilldown contract IDs and contract links. | `tests/procurement-query-helpers.test.ts`, `tests/procurement-analytics-page.test.tsx` |
| Sensitive intelligence data leaks across orgs or roles | intelligence route lacks org/role checks | Dedicated intelligence access checks enforce active org, role, owner scope, and plan gates. | `tests/intelligence-access.test.ts`, `tests/financial-intelligence-page.test.tsx`, `tests/procurement-analytics-page.test.tsx`, `tests/risk-queue-page.test.tsx` |
| AI-style authority creeps into customer copy | ai copy implies legal advice | Risk and analytics copy must stay operational and workflow-safe. | `tests/risk-queue-page.test.tsx`, `tests/risk-explanation-drawer.test.tsx` |
| Dashboard sections become vanity surfaces | dashboard cannot name action it drives | Every customer-facing intelligence section must link to contract work, not abstract insight. | `tests/financial-intelligence-page.test.tsx`, `tests/procurement-analytics-page.test.tsx`, `tests/risk-queue-page.test.tsx` |

## Release decision rule

If any blocker above fails, Intelligence is not release-ready even if the pages render and the base product workflow still passes.
