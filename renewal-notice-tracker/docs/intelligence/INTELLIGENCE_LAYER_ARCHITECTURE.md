# Intelligence Layer Architecture

This folder defines the future-safe backend architecture for three dormant intelligence layers:

- Financial Intelligence Layer
- Procurement Analytics Layer
- AI Risk Scoring Layer

## Non-negotiable rules

- Intelligence reads trusted workflow state only.
- Intelligence never mutates contract truth.
- Intelligence never activates reminders.
- Intelligence never bypasses review, owner, or trust gates.
- Intelligence does not appear in customer navigation in Phase 1.
- Every intelligence output must include trust and confidence metadata.

## Layer structure

- `lib/intelligence/shared/`
  - shared trust types
  - trusted workflow snapshot contract
  - shared confidence and warning helpers
- `lib/intelligence/financial/`
  - future renewal-value and financial exposure insight builders
- `lib/intelligence/procurement/`
  - future vendor-rollup and procurement insight builders
- `lib/intelligence/risk/`
  - future AI-assisted risk scoring builders

## Trust boundary

The intelligence layer is read-only and downstream of the shipped workflow:

`upload/import -> review P0 -> assign owner -> trusted reminder -> acknowledgment -> decision -> closure`

This means:

- no intelligence module may call reminder mutation code
- no intelligence module may call extraction mutation code
- no intelligence module may write contracts, reminders, or metadata
- no intelligence module may become a second source of truth

## Activation rule

These modules are architecture only until a future product decision explicitly proves:

- customer value beyond the shipped kernel
- clear trust semantics
- no leakage into the current reminder/review workflow
- release-proof boundary tests remain green
