# Shipped Kernel

The shipped kernel is the only customer-facing runtime NoticeControl is allowed to expose in Phase 1.

The canonical code source is [lib/product/shipped-kernel.ts](lib/product/shipped-kernel.ts).

The kernel is one weekly operator loop:

- upload or import
- review P0
- assign owner
- trusted reminder
- acknowledgment
- decision
- closure

It includes only:

- marketing pages aligned to vendor-side renewal and notice control
- authentication and organization-scoped dashboard access
- contracts list and a calm operator-first contract detail page
- manual upload and fixed CSV/XLSX import
- P0 review only
- owner assignment
- trusted reminders with a fixed shipped schedule
- acknowledgment
- decision and cycle actions
- CSV/XLSX export through explicit export presets: basic export is shipped by default, workflow/notes/intelligence exports are gated premium presets, and audit export is deferred until hardened
- Revenue Intelligence Command Center over existing renewal-control and commercial workflow evidence, with no external outreach delivery or CRM enrichment
- per-contract ICS export
- minimal settings for profile, billing, and workspace control
- internal rescue console for internal roles only

Anything outside this loop belongs in deferred capability or reference material, not in the shipped runtime.

The shipped kernel must not import deferred modules. Boundary tests enforce this.
