# Deferred Capabilities

Deferred capabilities are preserved for later development, but they are not part of the shipped runtime.

Canonical source:

- [lib/product/deferred-capabilities.ts](lib/product/deferred-capabilities.ts)
- [lib/product/platform-modules.ts](lib/product/platform-modules.ts) for module/add-on status and promotion gates

Allowed forms:

- deferred modules
- internal reference material
- legacy migration-only paths
- permanently excluded records for anti-scope drift

Forbidden forms:

- customer navigation
- shipped-first runtime imports
- active cron behavior
- active settings knobs
- release-critical tests that preserve deferred customer behavior

Current notable deferred items:

- playbooks
- custom reminder rules
- retention health surfaces
- customer-facing retention settings, legal hold, data residency, and broad customer data export
- advanced governance dashboards
- advanced integrations
- public API keys, scoped API tokens, customer webhooks, OAuth app connections, and data warehouse export
- broader counterparty system
- monthly digest
- public self-serve PayPal checkout/management and legacy Stripe migration-only paths
