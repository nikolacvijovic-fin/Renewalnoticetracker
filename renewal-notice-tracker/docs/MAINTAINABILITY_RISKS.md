# Maintainability Risks

This note tracks areas that deserve structural discipline before they become expensive.

## Most Fragile Areas

- Dashboard pages can become mini backends if workflow, billing, reminder, or intelligence rules drift into JSX files.
- Export/reporting can leak sensitive notes or intelligence fields if presets are bypassed.
- Intelligence access can drift if pages manually shape billing or role truth.
- Internal routes are high blast-radius paths and must keep explicit secret purpose, safe errors, and named logs.
- Reminder processing must keep lease/retry/write integrity visible and tested.
- Billing webhook behavior must stay provider-specific and fail safely.

## Highest-Value Future Refactors

- Continue migrating bespoke API routes to `createRouteHandler` where auth, writes, or sensitive data are involved.
- Move repeated Supabase query chains into scoped query helpers.
- Expand shared test factories into more route and page tests as they are touched.
- Add more page-truth tests where UI behavior is currently only helper-tested.
- Add structured log event checks for OCR and import routes.

## Areas To Avoid Expanding Too Early

- Slack/Teams delivery
- monthly digest
- playbooks and custom reminder rules
- approvals and negotiation tracking
- customer API
- full CLM lifecycle
- vendor enrichment or supplier performance scoring

These can stay in reference docs until shipped-kernel review promotes them.

## Tests To Add Next

- Route-handler adoption tests for remaining high-risk API routes.
- Tenant-scoped query helper tests for contract and reminder query modules.
- Export preset denial tests for any new sensitive preset.
- Intelligence surface consistency tests whenever a new visible surface appears.
- Log redaction tests when new metadata fields are logged.

## Docs To Keep In Sync

- `CONTRIBUTING.md`
- `docs/ARCHITECTURE_BOUNDARIES.md`
- `docs/OPERATIONAL_MATURITY.md`
- `docs/EXPORT_PRESETS.md`
- `docs/intelligence/INTELLIGENCE_RELEASE_GATE.md`
- `SHIPPED_KERNEL.md`
- `DEFERRED_CAPABILITIES.md`
- `NOT_SHIPPED_FIRST.md`

If a change modifies what ships, who can access it, what is exported, or what operators must monitor, update docs in the same pull request.
