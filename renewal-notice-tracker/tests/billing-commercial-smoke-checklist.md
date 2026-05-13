# Billing + Commercial Smoke Checklist

## Shipped-first commercial controls

1. Visit `/dashboard/contracts/new` as a free-tier org and confirm:
   - manual contract entry is visibly gated
   - multi-recipient reminder guidance explains the limit
   - the commercial capability summary matches the current plan status
2. Hit `/dashboard/contracts/export/csv` and `/dashboard/contracts/export/xlsx` as a free-tier org and confirm the app redirects with a commercial notice.
3. Visit `/dashboard/contracts?commercial=...` after a blocked export and confirm:
   - the contracts page shows the commercial notice banner
   - export buttons render disabled with an understandable upgrade message
4. Confirm reminder creation still blocks multiple recipients on lower plans.

## Billing runtime

1. Confirm Paddle orgs show a working `Manage billing` CTA.
2. Confirm legacy or manual invoice orgs do not show a fake portal and instead show the support-led billing message.
3. Confirm `/api/billing/checkout?provider=paypal` and `provider=stripe` return `400`.
4. Confirm `/api/webhooks/billing/paypal` and `/api/webhooks/stripe` return `410`.
5. Confirm `/api/billing/portal` still behaves as the compatibility alias for `/api/billing/manage`.

## Scope guardrails

1. Confirm settings shows a coherent capability summary for manual contracts, exports, and multi-recipient reminders.
2. Confirm settings does not mention monthly digest, Slack, Teams, or provider parity.
3. Confirm customer-visible pricing and services stay aligned with Starter, Growth, Portfolio, and the three scoped services.

## Email release gate

1. Confirm reminder emails use `NoticeControl <notifications@noticecontrol.com>`.
2. Confirm reminder emails use secure NoticeControl links for acknowledgment and decision instead of reply-based workflows.
3. Confirm delivery outcomes are visible through `notification_logs`.
4. Confirm the environment is configured with a sending domain, reply-to inbox, and email webhook signing secret before release.
