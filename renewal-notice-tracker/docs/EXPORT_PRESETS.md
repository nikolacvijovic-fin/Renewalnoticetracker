# NoticeControl Export Presets

NoticeControl exports are now explicit presets, not one implicit export shape. The default route behavior remains backward compatible: CSV/XLSX exports with no `preset` query parameter use `basic_contract_register`.

## Shipped Presets

### `basic_contract_register`
- Status: shipped default
- Access: current exports entitlement
- Roles: Admin, Operator, Reviewer, Owner
- Formats: CSV, XLSX
- Sections: contract register
- Notes: contract notes, decisions history, intelligence fields, raw evidence, and audit logs are not included.

### `workflow_export`
- Status: shipped premium preset
- Access: Growth-equivalent workflow/risk-score entitlement
- Roles: Admin, Operator, Reviewer
- Formats: CSV, XLSX
- Sections: basic contract register, workflow state, reminder status, latest decision

### `notes_and_decisions_export`
- Status: shipped premium preset
- Access: Growth-equivalent workflow/risk-score entitlement
- Roles: Admin, Operator
- Formats: CSV, XLSX
- Sections: workflow export plus sanitized note counts, latest note metadata, latest note preview, and decision history summary
- Notes: note preview is sanitized and truncated. Notes are never part of the default basic export.

### `intelligence_export`
- Status: shipped premium preset
- Access: intelligence entitlement and risk queue access
- Roles: Admin, Operator, Reviewer
- Formats: CSV, XLSX
- Sections: workflow export plus risk band, score points, confidence level, missing-data warning count, and trusted financial fields
- Notes: no raw extraction payloads, raw evidence, or customer-sensitive clause text are exported.

## Deferred Preset

### `audit_export`
- Status: deferred placeholder
- Access: not selectable
- Intended future access: Admin only, Portfolio/Enterprise-grade audit export controls
- Reason deferred: customer-visible audit exports need stricter review of redaction, scope, and audit evidence before they can ship safely.

## Route Usage

- `/dashboard/contracts/export/csv`
- `/dashboard/contracts/export/xlsx`
- `/dashboard/contracts/export/csv?preset=workflow_export`
- `/dashboard/contracts/export/xlsx?preset=notes_and_decisions_export`
- `POST /api/exports/contracts` with `{ "preset": "workflow_export", "format": "csv" }` creates a queued background export request.
- `GET /api/exports/contracts/{id}` returns org-scoped background export status metadata only.
- `GET /api/exports/contracts/{id}/download` downloads a completed, unexpired background export artifact.
- `POST /api/internal/export-jobs` processes a bounded number of queued exports behind the operations internal secret.
- `POST /api/internal/export-jobs` with `{ "mode": "cleanup_expired" }` removes expired artifacts and marks requests expired.

Unsupported or deferred presets fail safely before export payload generation.

## Background Export Workflow

Synchronous CSV/XLSX downloads remain capped at `5000` rows. When a synchronous export exceeds that cap, the route returns `ERR_EXPORT_BACKGROUND_REQUIRED_001` with the background request endpoint to use.

Background exports currently:
- reuse `data_export_requests`
- move through `queued`, `processing`, `completed`, or `failed`
- enforce the same preset, role, billing, shipped-action, and intelligence gates before request creation
- generate and sanitize CSV/XLSX payloads during processing
- store generated artifacts in a private Supabase storage bucket configured by `SUPABASE_EXPORTS_BUCKET`
- record row count, included sections, sensitive-section flag, format, preset, actor, organization, artifact size, checksum, content type, filename, expiry, and safe failure code/category
- audit request, completion, and failure events
- audit downloads and expiration cleanup

Background export artifacts expire after seven days. Status responses expose `downloadAvailable`, `expiresAt`, `artifactSizeBytes`, `filename`, completion/failure timestamps, and safe failure codes. They never expose storage bucket names or object paths.

Still deferred:
- scheduled exports
- customer API export automation
- audit export packaging
- data warehouse or external sync
