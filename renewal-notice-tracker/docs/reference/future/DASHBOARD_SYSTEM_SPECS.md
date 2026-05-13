# Dashboard System Specs

## Goal

Define operator dashboards that support real decisions for:

- founder / executive
- product
- growth / revenue
- retention / customer success
- support / operations
- reliability / trust

These are not vanity dashboards.

## Founder / Executive dashboard

- Purpose: judge whether growth is improving business quality
- Target user: founder, CEO, GM
- Primary questions:
  - are we growing profitably
  - which segments and channels are worth more investment
  - is retention improving because workflow embedding is improving
  - are support or reliability problems threatening margin
- KPIs:
  - MRR and ARR
  - new / expansion / contraction MRR
  - GRR and NRR
  - gross margin by segment
  - contribution margin per account
  - embedded workflow rate
  - negative-margin account rate
- Charts and tables:
  - MRR bridge
  - segment profitability table
  - source quality table
  - retention trend by plan and source
- Filters:
  - time period
  - segment
  - source
  - plan
  - annual vs monthly
- Decisions:
  - where to invest GTM
  - what segments to cut
  - whether pricing or packaging needs change

## Product dashboard

- Purpose: measure whether customers reach trusted workflow value
- Target user: product lead
- Primary questions:
  - where activation breaks
  - which workflow steps stall
  - whether extraction/review is trusted enough
  - which features deepen embedding
- KPIs:
  - workspace activation rate
  - time to first reviewed contract
  - time to first owner
  - time to first reminder
  - reviewed coverage
  - owner coverage
  - due-soon decision coverage
- Charts and tables:
  - activation funnel
  - workflow step drop-off chart
  - cohort trend for reviewed coverage
  - backlog aging
- Decisions:
  - which onboarding or UX changes to ship next
  - which workflow steps to simplify

## Growth / Revenue dashboard

- Purpose: see whether acquisition and pricing are producing activated paid accounts
- Target user: growth lead or founder-led sales owner
- Primary questions:
  - which channels create activated paid accounts
  - which upgrade triggers convert best
  - whether pricing gates are working
  - where checkout leaks
- KPIs:
  - pricing page to signup rate
  - trial to activation
  - activation to paid
  - checkout completion
  - upgrade CTA CTR
  - gate click-through rate
  - plan mix by logos and MRR
- Decisions:
  - where to spend acquisition effort
  - what pricing prompt to improve
  - when to route into sales assist

## Retention / Customer Success dashboard

- Purpose: identify healthy, weak, at-risk, and expansion-ready accounts
- Target user: CS or founder
- Primary questions:
  - which accounts are at risk
  - which need onboarding help
  - which are healthy enough to expand
  - which are losing workflow discipline
- KPIs:
  - account health score
  - weekly workflow-active account rate
  - owner coverage by account
  - due-soon decision coverage
  - reminder continuity
  - needs-review backlog aging
  - contract-cap pressure
- Decisions:
  - which accounts to save first
  - which accounts need service intervention
  - which accounts are upgrade-ready

## Support / Operations dashboard

- Purpose: reduce avoidable support and rescue burden
- Target user: support lead or ops owner
- Primary questions:
  - where support burden is rising
  - which issues drive repeated rescue
  - which accounts are consuming too much human time
  - what should be automated next
- KPIs:
  - support touches per active account
  - support time per account
  - onboarding blocker resolution time
  - messy-import burden rate
  - manual rescue volume
  - high-touch low-ACV account rate
- Decisions:
  - what to automate
  - where to enforce paid services
  - which issues are product gaps vs bad-fit customer problems

## Reliability / Trust dashboard

- Purpose: protect the product promise and catch hidden failure quickly
- Target user: engineering lead, ops, product, support lead
- Primary questions:
  - are reminders reliable and on time
  - are retries helping or hiding problems
  - is extraction quality good enough
  - are wrong-behavior incidents rising
- KPIs:
  - reminder delivery success
  - duplicate suppression
  - cron success and lag
  - retry recovery
  - extraction failure rate
  - low-confidence extraction rate
  - review completion rate
  - wrong-behavior incident rate
- Decisions:
  - where to escalate incidents
  - what reliability work to prioritize
  - when to proactively contact affected customers
