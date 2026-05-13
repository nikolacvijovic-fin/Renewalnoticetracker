# Runtime Hardening Changes

- Centralized commercial policy into one runtime source in `lib/billing/policy.ts`.
- Stopped imported contracts in `needs_review` from receiving reminder-backed automation before review.
- Added due-soon review and owner guardrails to organization health so risky backlog is visible in operator tooling.
- Kept stale critique intentionally ignored where the repo already had the right architectural direction.
