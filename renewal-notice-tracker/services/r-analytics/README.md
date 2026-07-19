# R Analytics Research Service

This scaffold is the read-only analytics and research layer for NoticeControl. It teaches practical R skills through renewal-control analytics without giving R direct access to production systems.

## Product Subsystem

R owns:

- Renewal spend forecasting
- Risk trend analysis
- Savings opportunity analysis
- Customer activation and cohort analysis

R does not own:

- Customer-facing UI
- Billing or entitlement decisions
- Production database writes
- Contract workflow truth
- Email or reminder delivery

## Current Status

Scaffolded. Scripts use local fixture CSVs only. No production credentials are required.

## Run

```bash
Rscript services/r-analytics/scripts/renewal_spend_forecast.R
Rscript services/r-analytics/scripts/risk_trend_analysis.R
Rscript services/r-analytics/scripts/savings_opportunity_analysis.R
Rscript services/r-analytics/scripts/customer_activation_cohorts.R
Rscript -e "testthat::test_dir('services/r-analytics/tests/testthat')"
```

If R or `testthat` is not installed, treat these scripts as documented scaffolds until the analytics runtime is available.

## Learning Tasks

Beginner:

- Read fixture CSVs.
- Validate required columns.
- Compute a deterministic summary table.

Intermediate:

- Add a new redacted fixture.
- Add a cohort summary script.
- Compare spend/risk groups without reading production data.

Advanced:

- Prototype forecast assumptions for future reporting.
- Add model validation from exported reporting views.
- Design dashboard-ready output contracts for TypeScript.

## Integration Boundary

R consumes exported/reporting data only. It should never call Supabase directly with service credentials, never read raw contract files, and never write production records. Productized analytics must flow back through TypeScript and SQL reporting contracts.
