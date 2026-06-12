# Legacy Dependencies

NoticeControl shipped-first runtime does not retain any npm package solely for legacy billing providers or deferred delivery channels.

Current outcome:
- `stripe` was removed from the shipped dependency graph.
- No Slack-only or Teams-only npm package is installed for shipped runtime.
- Legacy PayPal and Stripe provider files remain under [legacy/billing/providers](../legacy/billing/providers) for migration/reference purposes only.

Rules:
- Shipped runtime code under `app/`, `components/`, and shipped `lib/` modules must not import `legacy/` billing providers.
- Legacy provider env parsing lives under [legacy/billing/config.ts](../legacy/billing/config.ts), not the shipped env surface.
- `.env.example` documents only shipped runtime variables.

If a future migration requires reactivating a legacy provider:
1. Reintroduce its package dependency intentionally.
2. Restore migration-only runtime proof under `legacy/`.
3. Keep shipped customer runtime Paddle-first unless product scope changes explicitly.
