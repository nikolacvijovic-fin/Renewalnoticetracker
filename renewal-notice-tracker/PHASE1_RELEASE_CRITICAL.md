# Phase-1 Release Critical

This is the shipped runtime release gate for NoticeControl.

Release-critical proof covers only:

- auth, session, and callback protection
- active organization selection and binding
- upload and fixed-template import
- P0 review
- owner assignment
- trusted reminder activation and lifecycle safety
- acknowledgment
- renewal decision recording
- cycle close and reopen
- CSV and XLSX export
- per-contract ICS export
- Paddle checkout and billing management
- manual invoice exception handling
- internal rescue authorization
- cross-tenant denial

Release-critical proof explicitly does not expand into:

- readiness or capacity scoring
- profitability or support-economics theory
- future analytics systems
- monthly digest
- playbooks
- custom reminder rules

Release is still blocked if the shipped loop depends on hidden founder rescue instead of auditable operator/support actions. See [docs/TWO_WEEK_AUTONOMY_GATE.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/TWO_WEEK_AUTONOMY_GATE.md).

Proof commands:

```bash
npm run typecheck
npm run test:release-critical
npm run release:check
npm run e2e:p0:required
npm run smoke:staging
```

If the shipped loop passes but a future/reference suite fails, that is not a Phase-1 release blocker unless the failure leaks into shipped runtime.
