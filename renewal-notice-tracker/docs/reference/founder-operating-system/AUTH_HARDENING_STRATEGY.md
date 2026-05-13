# Auth Hardening Strategy

This document is the auth-focused hardening blueprint for Renewal / Notice Date Tracker.

Canonical source:
- `C:\Users\Lenovo\Documents\Playground\renewal-notice-tracker\lib\commercial\auth-hardening.ts`

It covers:
- current passwordless and callback reality
- magic-link hardening
- session handling and session fixation risk
- redirect safety
- password reset posture
- account bootstrap flow
- anti-abuse and rate limiting
- suspicious auth-event logging
- fallback auth model decisions
- UX and security trade-offs
- best auth flow, session posture, rate limits, auth events, top auth risks, and top auth fixes

Blunt auth stance:
- Passwordless is a good default for this product.
- Redirect safety and org-context safety matter more than adding more auth surface area.
- Password reset should not look more “supported” than it really is.
- Supabase auth is only the identity layer; application authorization and active-org context still decide whether the product is actually safe.
