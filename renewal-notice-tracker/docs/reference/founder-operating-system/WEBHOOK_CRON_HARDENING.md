# Webhook and Cron Route Hardening

This document is the webhook, cron, and internal-route hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- [lib/commercial/webhook-cron-hardening.ts](../../../lib/commercial/webhook-cron-hardening.ts)

It covers:
- endpoint-by-endpoint risk review
- authentication model for each endpoint
- replay and idempotency recommendations
- logging and alerting recommendations
- top abuse scenarios
- code-level hardening recommendations

Blunt stance:
- Payment webhooks are privileged machine-authenticated admin actions.
- Cron routes are privileged machine APIs with outbound side effects.
- Internal health should not double as a casual customer-visible debug surface.
- Generic error responses and idempotency are table stakes, not polish.
