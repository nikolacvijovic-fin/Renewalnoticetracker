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

- shipped runtime follows the single operator loop defined in [docs/CURRENT_PRODUCT_TRUTH.md](docs/CURRENT_PRODUCT_TRUTH.md)
- deferred capabilities are cataloged in [DEFERRED_CAPABILITIES.md](DEFERRED_CAPABILITIES.md)
- future activation requirements are defined in [FUTURE_ACTIVATION_RULES.md](FUTURE_ACTIVATION_RULES.md)
- broader strategy, legacy, and founder-operating-system material lives under [docs/reference](docs/reference)

## Verification

```bash
npm run typecheck
npm run test:scope-freeze
npm run test:release-critical
npm run release:check
```

## Canonical scope docs

- [docs/CURRENT_PRODUCT_TRUTH.md](docs/CURRENT_PRODUCT_TRUTH.md)
- [docs/FUTURE_REFERENCE_INDEX.md](docs/FUTURE_REFERENCE_INDEX.md)
- [SHIPPED_FIRST_SCOPE.md](SHIPPED_FIRST_SCOPE.md)
- [SHIPPED_KERNEL.md](SHIPPED_KERNEL.md)
- [NOT_SHIPPED_FIRST.md](NOT_SHIPPED_FIRST.md)
- [DEFERRED_CAPABILITIES.md](DEFERRED_CAPABILITIES.md)
- [FUTURE_ACTIVATION_RULES.md](FUTURE_ACTIVATION_RULES.md)
- [EARLY_RBAC.md](EARLY_RBAC.md)
- [PHASE1_DEFINITION_OF_DONE.md](PHASE1_DEFINITION_OF_DONE.md)
