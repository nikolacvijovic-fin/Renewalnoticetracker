# Multi-Language Enterprise Learning Architecture

NoticeControl is a TypeScript/React product shell with trusted SQL storage and optional service runtimes for intelligence, reliability, analytics, and enterprise integrations. The goal is not to use languages for novelty. Each runtime owns a commercial subsystem and teaches practical engineering skills.

## Ownership Model

| Language | Product subsystem | Runtime location | Status |
| --- | --- | --- | --- |
| TypeScript | Product orchestration, domain logic, server actions, entitlement checks, service clients | `app/`, `lib/` | Active |
| React | Dashboards, onboarding, admin UI, contract detail experiences | `app/**/*.tsx`, `components/**/*.tsx` | Active |
| SQL | Supabase/Postgres schema, RLS, constraints, reporting views, audit backbone | `supabase/migrations` | Active |
| Python | Contract intelligence, OCR/document extraction, quote comparison, usage reconciliation | `services/python-intelligence` | Scaffolded |
| Go | Reliable background workers, reminders, queues, retries, webhooks | `services/go-worker` | Scaffolded |
| R | Analytics, forecasting, spend/risk modeling, cohorts | `services/r-analytics` | Scaffolded |
| Java | Enterprise connectors, procurement/ERP adapters, identity/workflow integration scaffolds | `services/java-enterprise-connectors` | Scaffolded |

The structured source of truth is `lib/learning/language-subsystems.ts`.

## Boundaries

TypeScript/React is the product shell. Customer-facing UI must call TypeScript server actions, route handlers, query helpers, or typed clients. It must not import service implementation files from Python, Go, R, or Java.

SQL is the trust and reporting backbone. RLS, constraints, indexes, reporting views, and audit ledgers belong in SQL. Application code may orchestrate policy, but tenant isolation must not depend only on UI discipline.

Python is intelligence. OCR, extraction, quote comparison, and source-grounded analysis belong there once provider-backed workflows are ready. Python must not own billing, auth, UI, or workflow truth.

Go is reliability. Queue processing, retries, stale rescue, reminder dispatch, and webhook normalization belong there when moved out of cron-style routes. Go must not own customer UI or entitlement policy.

R is analytics and research. R consumes redacted exports/reporting fixtures. It must not connect directly to production databases or write product state.

Java is optional enterprise integration. Procurement, ERP, identity, and workflow connector adapters belong there when explicitly gated. Java must not become a parallel product backend.

## Service Communication Rules

- React calls TypeScript only.
- TypeScript calls Supabase/Postgres through scoped helpers.
- TypeScript calls Python/Go/Java through signed clients or internal route contracts.
- Go writes job/audit/reminder status only through trusted tenant-scoped paths.
- R consumes exported/reporting data only.
- SQL stores audit/reporting truth.

The structured integration map is `lib/learning/integration-map.ts`.

## Security Requirements

- No raw contract text, OCR output, full notes, provider payloads, storage paths, tokens, secrets, certificates, private keys, uploaded documents, or email bodies in logs/tests/docs.
- No customer-facing route may import service implementation files.
- No service may bypass TypeScript/Supabase tenant-scoping rules.
- Service calls must be signed once they leave the Next.js process.
- R analytics must remain read-only and fixture/export-based.
- Java enterprise connectors must remain optional and enterprise-gated.

## Local Development Commands

Product shell:

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
```

Learning architecture:

```bash
npm run test:learning-architecture
npm run test:multi-language-boundary
npm run test:add-ons
```

Python:

```bash
cd services/python-intelligence
pip install -e ".[test]"
pytest
```

Go:

```bash
cd services/go-worker
go test ./...
go run ./cmd/worker --health
```

Java:

```bash
cd services/java-enterprise-connectors
mvn test
```

R:

```bash
Rscript services/r-analytics/scripts/renewal_spend_forecast.R
Rscript services/r-analytics/scripts/risk_trend_analysis.R
Rscript services/r-analytics/scripts/savings_opportunity_analysis.R
Rscript services/r-analytics/scripts/customer_activation_cohorts.R
Rscript -e "testthat::test_dir('services/r-analytics/tests/testthat')"
```

R is optional locally. Do not make Node release checks depend on R unless the CI image installs R and `testthat`.

## Deployment Assumptions

- TypeScript/React deploy as the primary Next.js app.
- SQL migrations deploy through the Supabase/Postgres migration path.
- Python/Go/Java services are optional add-on runtimes and must be configured before use.
- R does not deploy as a request-path service; it is a research/reporting scaffold.
- Missing optional services must fail closed and customer-safe.

## Learning Objectives

TypeScript:

- Beginner: trace a server action and add a helper test.
- Intermediate: extract a view model or route guard.
- Advanced: design a premium gated workflow with signed service integration.

React:

- Beginner: update a dashboard card with existing tokens.
- Intermediate: build an internal registry-driven page.
- Advanced: harden cross-surface entitlement UI behavior.

SQL:

- Beginner: read RLS policies.
- Intermediate: design append-only audit ledgers.
- Advanced: model immutable evidence and reporting views.

Python:

- Beginner: run deterministic endpoint tests.
- Intermediate: add a fixture-backed intelligence contract.
- Advanced: implement source-grounded provider workflows with QA.

Go:

- Beginner: run worker tests.
- Intermediate: add retry/idempotency fixtures.
- Advanced: move a background workflow into lease-safe execution.

R:

- Beginner: read CSV fixtures and validate columns.
- Intermediate: create deterministic cohort summaries.
- Advanced: prototype forecasting assumptions for dashboard productization.

Java:

- Beginner: run connector tests.
- Intermediate: add a mocked enterprise adapter.
- Advanced: implement a provider-specific connector behind enterprise gates.

## What Must Wait

- Revenue Intelligence and cold outreach runtime
- Slack/Teams war rooms
- Live SaaS integrations
- Automatic notice sending
- Fake SSO/SCIM provider behavior
- R direct production database access
- Customer-facing integration settings before gates/tests exist
