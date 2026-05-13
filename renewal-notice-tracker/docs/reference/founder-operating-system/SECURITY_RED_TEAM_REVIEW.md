# Security Red-Team Review

## Brutal critique
The product looks more mature in strategy artifacts than it is proven in runtime enforcement. The biggest risk is false confidence: route-level gating, documentation, and admin surfaces can all look correct while privileged backend paths, replay behavior, or scoped rescue flows still leave real gaps.

## Top danger areas
- raw-id privileged lookups
- admin/debug convenience leakage
- webhook replay and state drift
- cron/control-plane secret misuse
- deletion/export vagueness
- logs or audit payloads turning into sensitive data sinks

## What must change first
- prove object-level tenant enforcement everywhere sensitive
- harden admin/debug/rescue actions
- enforce replay-safe webhook and cron behavior
- make critical security tests real release gates
