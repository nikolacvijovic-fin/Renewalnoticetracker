# Deferred Capabilities

Deferred capabilities are preserved for later development, but they are not part of the shipped runtime.

Canonical source:

- [lib/product/deferred-capabilities.ts](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/lib/product/deferred-capabilities.ts:1)
- [lib/product/platform-modules.ts](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/lib/product/platform-modules.ts:1) for module/add-on status and promotion gates

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
- advanced governance dashboards
- advanced integrations
- broader counterparty system
- monthly digest
- PayPal and legacy Stripe migration-only paths
