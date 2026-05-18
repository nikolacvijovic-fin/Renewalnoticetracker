# Intelligence Release Gate

NoticeControl Intelligence does not ship because the dashboards look impressive. It ships only when the outputs stay narrow, explainable, and workflow-safe.

## Hard blockers

The intelligence layer is blocked from release if any of the following are true:

1. financial values lack trust labels
2. multi-currency values summed without policy
3. risk score lacks reasons
4. risk score lacks confidence level
5. risk score uses unreviewed data as high-confidence
6. procurement metric lacks drilldown
7. intelligence route lacks org/role checks
8. ai copy implies legal advice
9. dashboard cannot name action it drives

## Required proof

Each intelligence release must prove all of the following before customer release:

- Every intelligence output includes trust or confidence metadata that explains how much to trust the result.
- Every financial output includes calculation basis and warning metadata.
- Every risk score includes human-readable reasons, a confidence level, and missing-data warnings.
- Every procurement metric drills down to contract IDs or contract lists that stay within the active organization.
- Every intelligence route enforces organization, role, and plan gates before data is shown.
- No intelligence copy implies legal advice or recommends legal action.
- Every dashboard section names the workflow action it is intended to drive, such as review, assign, acknowledge, decide, or clean up vendor identity.

## Release posture

This gate is intentionally separate from the Phase 1 shipped-kernel release-critical loop. `test:release-critical` stays focused on the base NoticeControl workflow. Intelligence ships only when `test:intelligence-release-gate` also passes.
