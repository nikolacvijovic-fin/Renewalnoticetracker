# Pricing / Trial / Entitlement Changes

- Pricing and entitlement rules now have one canonical source in `lib/billing/policy.ts`.
- Trial duration, annual discount policy, failed-payment grace window, downgrade behavior, and processor parity are now explicit in code.
- Contract limits and plan prices are reused from the same policy source instead of being duplicated across runtime and marketing layers.
