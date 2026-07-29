# Revenue Intelligence Release Gate

Future external Revenue Intelligence and cold outreach are not shipped runtime features.

The shipped Revenue Intelligence Command Center is a bounded CFO-facing aggregation layer over existing contract, quote, savings, commercial decision, negotiation, and internal draft-only outreach evidence. It is documented separately in `docs/REVENUE_INTELLIGENCE_COMMAND_CENTER.md` and does not send messages, enrich leads, run campaigns, or expose a lead database.

No runtime Revenue Intelligence module may ship for external outreach, lead generation, campaign execution, CRM enrichment, or autonomous sales workflows until all blockers below are implemented, tested, and reviewed:

- organization-scoped outreach schema
- RLS policies for every outreach table
- no direct service-role access from outreach modules
- suppression, opt-out, bounce, and complaint model
- AI governance model with prompt IDs, prompt versions, source evidence, generated-claim checks, QA status, and human approval
- audit taxonomy for lead import, evidence review, draft generation, QA failure, approval, export, suppression hit, and send/block decisions
- approval workflow that prevents generation/export/send without human review
- tenant isolation tests
- permission and internal-role tests
- audit/log/monitoring metadata safety tests
- deferred/runtime import-boundary tests

## Current Allowed Scope

The only allowed future/external Revenue Intelligence code today is foundation code under `deferred/revenue-intelligence`.

The compatibility shim at `lib/product/revenue-intelligence.ts` exists only so existing boundary tests and registries can reference the future foundation without making it a shipped runtime module.

The bounded command-center runtime under `lib/revenue-intelligence` is allowed only because it aggregates existing shipped commercial workflow evidence and preserves the no-sending/no-enrichment boundary.

## Not Allowed

- lead database
- campaign UI
- automated outreach generation
- email sending
- CRM enrichment or sync
- scraping or enrichment provider calls
- public API access
- customer-facing external outreach or lead-generation Revenue Intelligence navigation
- treating planned/restricted markets as active outreach markets

## Promotion Rule

Revenue Intelligence must pass platform capability evaluation, market policy, suppression checks, AI governance, audit taxonomy, and human approval gates before any runtime route, worker, export, or provider call can be added.
