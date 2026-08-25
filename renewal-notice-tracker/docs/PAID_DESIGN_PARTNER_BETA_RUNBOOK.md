# Paid Design-Partner Beta Runbook

## Runtime Truth

- Active subscription recommendations require both `resolved_at` and `superseded_at` to be null.
- Historical recommendations are read-only and excluded from savings totals.
- Manual synchronization advances through `created`, `authenticating`, `fetching_snapshot`, `snapshot_persisted`, `reconciling`, `findings_persisted`, and `completed`; failures record the failed stage.
- A retry after snapshot persistence reuses the same usage batch. Three attempts are permitted per logical daily interval.
- Reconnected findings link to the resolved predecessor. Exact rules/taxonomy versions are material evidence; stable family names define logical identity.
- Design Partner Beta controls are founder-managed. Expired/grace organizations retain read access but cannot upload, connect, synchronize, or create findings through the gated paths.

## Validation Boundaries

Node/Python/database fixture tests prove deterministic application behavior. They do not prove Microsoft publisher verification, Google OAuth verification, real-tenant consent, production credential rotation, legal sufficiency, penetration testing, or production backup restoration. See [DESIGN_PARTNER_BETA_EXTERNAL_READINESS.md](DESIGN_PARTNER_BETA_EXTERNAL_READINESS.md).

## Deployment Order

1. Deploy migration `202608240001_paid_design_partner_beta_readiness.sql`.
2. Regenerate/verify database types.
3. Deploy application and Python service together because reconciliation responses now include stable family fields.
4. Create beta controls through founder/service tooling only after the organization and billing snapshot exist.
5. Run disposable fixture, then controlled real-provider verification before customer activation.

## Forward Fix

Do not roll back by deleting customer rows. Disable new beta controls or place affected organizations in `read_only`, deploy a corrective migration, and preserve sync attempts, usage batches, findings, reviews, and lineage for audit.
