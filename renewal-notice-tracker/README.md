# NoticeControl

NoticeControl ships first as a vendor-side renewal and notice control product.

## Current product truth

- manual contract upload
- fixed CSV/XLSX template import
- P0 review for notice deadline, renewal date, expiration date, termination window, and auto-renewal
- required owner assignment before trusted reminders
- email reminders and an in-app due-soon queue
- per-contract ICS export
- customer roles: Admin, Operator, Reviewer, Owner
- Paddle as the only shipped-first self-serve billing provider
- manual invoice exceptions handled internally
- customer-facing services limited to onboarding, import cleanup, and renewal-ops setup

## Trust-sensitive routes

- `/api/extract` requires authenticated, org-scoped customer access and records audit logs for extraction previews
- `/api/reminders` requires authenticated, org-scoped customer access and records audit logs for reminder previews
- `/api/cron/send-reminders` is machine-authenticated
- `/api/internal/health` accepts only the `x-internal-health-secret` header
- `/api/internal/ocr-jobs` accepts only the `x-internal-ocr-secret` header
- `/api/internal/backup-readiness`, `/api/internal/restore-drill`, and `/api/internal/ops-snapshots` accept only the `x-internal-operations-secret` header
- `/api/internal/workspace-deletion` requires the `x-internal-destructive-ops-secret` header plus a timestamped `x-internal-destructive-signature` HMAC over the request body and path

## Billing runtime

- `/api/billing/checkout` and `/api/billing/manage` are Paddle-only in shipped-first runtime
- `/api/webhooks/billing/paddle` remains active
- legacy billing webhook routes are quarantined and return `410`

## Scope boundaries

- shipped runtime follows the single operator loop defined in [docs/CURRENT_PRODUCT_TRUTH.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/CURRENT_PRODUCT_TRUTH.md)
- deferred capabilities are cataloged in [DEFERRED_CAPABILITIES.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/DEFERRED_CAPABILITIES.md)
- future activation requirements are defined in [FUTURE_ACTIVATION_RULES.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/FUTURE_ACTIVATION_RULES.md)
- broader strategy, legacy, and founder-operating-system material lives under [docs/reference](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/reference)

## Verification

```bash
npm run typecheck
npm run test:scope-freeze
npm run test:release-critical
npm run release:check
```

## Canonical scope docs

- [docs/CURRENT_PRODUCT_TRUTH.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/CURRENT_PRODUCT_TRUTH.md)
- [docs/FUTURE_REFERENCE_INDEX.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/docs/FUTURE_REFERENCE_INDEX.md)
- [SHIPPED_FIRST_SCOPE.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/SHIPPED_FIRST_SCOPE.md)
- [SHIPPED_KERNEL.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/SHIPPED_KERNEL.md)
- [NOT_SHIPPED_FIRST.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/NOT_SHIPPED_FIRST.md)
- [DEFERRED_CAPABILITIES.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/DEFERRED_CAPABILITIES.md)
- [FUTURE_ACTIVATION_RULES.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/FUTURE_ACTIVATION_RULES.md)
- [EARLY_RBAC.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/EARLY_RBAC.md)
- [PHASE1_DEFINITION_OF_DONE.md](C:/Users/Lenovo/Documents/Playground/renewal-notice-tracker/PHASE1_DEFINITION_OF_DONE.md)
