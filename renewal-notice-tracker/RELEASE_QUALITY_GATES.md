# Release Quality Gates

This file exists only to point at the shipped Phase-1 release truth.

Canonical runtime release sources:

- [PHASE1_DEFINITION_OF_DONE.md](PHASE1_DEFINITION_OF_DONE.md)
- [PHASE1_RELEASE_CRITICAL.md](PHASE1_RELEASE_CRITICAL.md)
- [PHASE1_RELEASE_TEST_MATRIX.md](PHASE1_RELEASE_TEST_MATRIX.md)
- [scripts/phase1-release-gates.mjs](scripts/phase1-release-gates.mjs)

For the shipped runtime, release quality is pass/fail, not a maturity score:

- org safety
- role safety
- reminder reliability visibility
- import honesty
- billing correctness
- audit logging on trust-sensitive actions
- email delivery plumbing presence
- no deferred runtime leakage

Anything broader than the shipped kernel belongs in offline reference, not in release proof.
