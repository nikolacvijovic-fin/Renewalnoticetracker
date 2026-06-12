# NoticeControl Architecture Boundaries

NoticeControl is a renewal-control product, not a general CLM suite. Architecture should keep that boundary obvious.

The module/add-on source of truth is [PLATFORM_MODULE_REGISTRY.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/PLATFORM_MODULE_REGISTRY.md), backed by `lib/product/platform-modules.ts`.

## Shipped Kernel

The shipped kernel is the narrow operating loop:
- auth/session and active organization safety
- upload/import
- P0 review
- owner assignment
- trusted reminders
- acknowledgment
- decision
- cycle close/reopen
- CSV/XLSX and ICS export
- Paddle checkout/manage and manual invoice exception
- audited internal rescue
- cross-tenant denial

Release-critical proof should stay narrow, brutal, and relevant to this loop.

## Deferred Capabilities

Deferred/reference capabilities include readiness, capacity, profitability, support economics, future analytics, digest, playbooks, custom rules, Slack/Teams, customer API, approvals, negotiation tracking, and full CLM workflows.

Deferred code and docs may exist as references, but shipped runtime paths must not quietly depend on them.

## Where Product Truth Lives

- Business rules: `lib/**` modules with domain names, for example `lib/contracts`, `lib/intelligence`, `lib/billing`, `lib/notifications`.
- Page view models: focused page-model/view-model helpers that prepare user-visible state without owning raw data access.
- Pages: auth boundary, data loading, calling shared composition helpers, and rendering.
- Database queries: dedicated query/helper modules with explicit organization scope.
- Billing policy: `lib/billing/*` and entitlement helpers.
- Route infrastructure: `lib/http` route handler utilities.
- Operational logs: `lib/observability/server-logger.ts`.

If a page begins interpreting workflow state, billing policy, reminder readiness, or intelligence access inline, move that logic toward a shared helper.

## Export And Reporting

Exports are preset-based. `lib/contracts/export.ts` owns preset definitions and column shape. Export routes own route access and response serialization.

Preset rules:
- Basic register is shipped and backward compatible.
- Workflow, notes/decisions, and intelligence exports are gated premium presets.
- Notes and intelligence never appear in the default basic export.
- Audit export remains admin-only/deferred until redaction, scope, and audit controls are proven.

## Intelligence

Intelligence reads from trusted workflow state and must not mutate contract truth, activate reminders, bypass review/owner/trust gates, or appear without access checks.

All intelligence outputs must carry trust/confidence metadata. Page access must flow through shared intelligence access helpers and canonical billing snapshot truth.

## Audit, Analytics, Logs, Monitoring

- Audit logs are customer/accountability truth.
- Analytics are product behavior and funnel measurement.
- Logs are operator/debugging signal.
- Monitoring/alerts are urgent operational action derived from logs/audit states.

Do not mix these concepts to make implementation easier. A customer-visible audit event must describe what actually happened, not what a page happened to compute.

## Component Organization Notes

- Dashboard pages should stay thin and call helpers for product-state composition.
- View models live near the domain they describe, for example `lib/contracts/contract-detail-view.ts` or `lib/intelligence/*/page-model.ts`.
- Form components should own user interaction and validation display, not authorization policy.
- Table/list components may render prepared rows and action links, but should not derive billing truth.
- Risk/intelligence UI must show band, reasons, confidence, and warnings without legal-advice copy.
- Export/reporting UI should select presets and explain gating without changing export truth.
- Settings/billing UI should reflect entitlement results from shared billing helpers.

## Safe Growth Rule

When adding a new capability, decide first:
- Is it shipped or deferred?
- Is it represented in the platform module registry with status, gate, owner surfaces, and required release proof?
- Which shared helper owns the rule?
- Which route/page consumes it?
- Which audit, analytics, log, and monitoring signal applies?
- Which tests prevent cross-tenant, entitlement, export, or intelligence drift?
