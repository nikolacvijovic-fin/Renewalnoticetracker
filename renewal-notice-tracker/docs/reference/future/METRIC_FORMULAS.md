# Metric Formulas

Canonical formula definitions for Renewal / Notice Date Tracker.

These formulas exist to stop metric drift across product, growth, CS, finance, and founder reporting.

## Included metrics

- north star
- activation
- WAO / MAO
- reviewed-contract rate
- owner-assignment rate
- reminder-coverage rate
- first-value completion rate
- first-paid-value completion rate
- upgrade conversion rate
- paid activation rate
- gross retention
- net retention
- churn rate
- expansion rate
- reminder send success rate
- extraction failure rate
- review completion rate
- unhealthy-account rate
- support burden per account
- margin-risk rate

## Principles

- use organizations, not users, as the primary unit where appropriate
- use active tracked contracts, not all stored contracts
- use workflow actions, not generic logins
- separate revenue retention from logo retention
- separate raw activity from trusted workflow depth
- separate support burden from paid services

## Notes

- The canonical machine-readable source of truth lives in:
  `lib/commercial/metric-formulas.ts`
- Admin/internal rendering lives in:
  `components/admin/admin-panel.tsx`
