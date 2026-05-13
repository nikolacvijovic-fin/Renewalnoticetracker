# Phase-1 Definition Of Done

This is the only release-ready definition of done for the shipped NoticeControl product.

## Product loop

One customer workspace can reliably run:

- sign in
- upload or fixed-template import
- review P0
- assign owner
- trusted reminder scheduling
- acknowledgment
- decision
- cycle action

## Release blockers

Release is blocked if any of these fail:

- org safety
- role safety
- trust-sensitive route safety
- reminder lifecycle visibility
- import partial-success honesty
- audit logging on trust-sensitive actions
- Paddle checkout/manage behavior
- internal rescue visibility
- shipped-kernel boundary enforcement
- deferred-feature leakage tests
- required email delivery plumbing expectations

## Email release gate

Phase-1 release requires:

- shipped sender identity: `NoticeControl <notifications@noticecontrol.com>`
- configured sending domain
- configured reply-to inbox
- configured webhook signing secret for bounce/suppression handling
- delivery logs and idempotency in runtime
- secure in-app action links for acknowledgment and decision

Replies to reminder emails are not an acknowledgment channel.

## Proof commands

```bash
npm run typecheck
npm run test:release-critical
npm run release:check
npm run e2e:p0:required
npm run smoke:staging
```

If any command above fails, Phase-1 is not done.
