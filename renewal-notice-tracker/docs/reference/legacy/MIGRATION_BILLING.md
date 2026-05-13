# Shipped-First Billing Runtime

NoticeControl Phase 1 ships with:

- Paddle as the only self-serve billing provider
- manual invoice exceptions handled internally
- no active self-serve PayPal or Stripe checkout/management paths

## Active customer-facing routes

- `POST /api/billing/checkout`
- `POST /api/billing/manage`
- `POST /api/webhooks/billing/paddle`

## Quarantined legacy routes

- `POST /api/webhooks/billing/paypal` returns `410`
- `POST /api/webhooks/stripe` returns `410`

Legacy provider code may remain in the repo for historical migration context, but it is not shipped-first runtime behavior and must not be surfaced in customer UI, setup steps, or checklists.

## Environment surface

Shipped-first setup requires only:

- `BILLING_PROVIDER_DEFAULT=paddle`
- `PADDLE_API_KEY`
- `PADDLE_WEBHOOK_SECRET`
- `PADDLE_ENVIRONMENT`
- `PADDLE_STARTER_PRICE_ID`
- `PADDLE_GROWTH_PRICE_ID`

PayPal and Stripe env vars are intentionally omitted from `.env.example` so new environments do not imply provider parity.

## Verification

1. Confirm settings presents Paddle as the self-serve billing path.
2. Confirm legacy/manual billing states show a support-led management message.
3. Confirm `POST /api/billing/checkout?provider=paypal` and `provider=stripe` return `400`.
4. Confirm `POST /api/webhooks/billing/paypal` and `POST /api/webhooks/stripe` return `410`.
