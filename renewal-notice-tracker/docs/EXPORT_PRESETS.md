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

Unsupported or deferred presets fail safely before export payload generation.
