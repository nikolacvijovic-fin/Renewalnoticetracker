# Enterprise Audit And Governance

NoticeControl now has a normalized enterprise audit view over existing operational and product ledgers. This does not replace the source audit tables. It gives admins and support operators one redacted, organization-scoped way to inspect trust, security, workflow, export, billing, and system events.

## Audit Sources

The enterprise audit model currently normalizes these sources:

- `audit_logs`
- `contract_audit_events`
- `trusted_reminder_gate_events`
- `trust_exception_approval_events`
- `renewal_decision_events`
- `organization_activation_events`

The canonical runtime model lives in `lib/enterprise-audit/audit-event-model.ts`. Query helpers live in `lib/enterprise-audit/audit-queries.ts`.

## Categories

Normalized events use these categories:

- `auth`
- `contract`
- `evidence`
- `trusted_reminder`
- `trust_exception`
- `renewal_decision`
- `import`
- `export`
- `billing`
- `admin`
- `integration`
- `system`

## Trust-Sensitive Events

Trust-sensitive events affect whether the product can safely treat a reminder, notice deadline, renewal decision, or weak-evidence exception as reliable.

Examples:

- Trust exception approval created, revoked, or denied
- Trusted reminder gate used with an approval
- Evidence review events
- Reminder gate blocker transitions

Contract detail now includes a compact enterprise trust timeline so reviewers can see why a reminder is trusted or blocked without reading raw internal metadata.

## Security-Sensitive Events

Security-sensitive events include:

- Export events
- Delete/destructive/admin events
- Failed permission attempts
- Internal route denial events
- Billing or webhook failures with security impact

Security-sensitive labels are for operational review. They are not a replacement for customer-facing audit truth or incident response.

## Metadata Redaction

Enterprise audit summaries, exports, and timeline views must never include raw customer or provider data.

Forbidden content includes:

- Raw contract text
- OCR output
- Full notes
- Provider payloads
- Storage paths
- Tokens, secrets, passwords, certificates, private keys
- Uploaded document contents
- Email bodies
- Debug traces and stack payloads

`redactEnterpriseAuditMetadata()` recursively removes forbidden keys and sensitive values from objects and arrays. Long strings are bounded before display/export.

## Query Rules

Enterprise audit queries are intentionally conservative:

- Every query requires `organizationId`.
- No broad cross-tenant audit browser exists.
- Default limit is 50 events.
- Hard cap is 250 events.
- Contract timelines filter by `organizationId` and `contractId`.
- Specialized filters are applied after normalization so trust/security labels are consistent.

## Admin Surfaces

Internal-only routes:

- `/admin/audit?organizationId=...`
- `/admin/enterprise-readiness?organizationId=...`

Both routes use existing internal role authorization and require an explicit organization id.

## Audit Export Scaffold

`lib/enterprise-audit/audit-export.ts` supports JSON and CSV export from the normalized model.

Rules:

- Organization-scoped only
- Redacted metadata only
- Date and sensitivity filters supported
- Records a best-effort `enterprise_audit.exported` audit event
- Does not expose a broad customer download route yet

## Enterprise Readiness

`lib/enterprise-readiness/enterprise-readiness-score.ts` computes a conservative readiness score from shipped controls and audit evidence.

Critical controls include:

- Trust approval immutability
- Server-computed evidence confidence
- Strict RLS and tenant-scope checks
- Audit event coverage
- Trusted reminder gate event coverage
- Trust exception approval event coverage
- No unresolved critical security-sensitive events

Maturity warnings include:

- Reminder delivery reliability visibility
- SSO/SCIM not configured
- Backup/restore status missing
- Monitoring/alerting status missing
- Add-on request signing missing
- Stale review or approval risks

The readiness score must not claim full enterprise readiness while critical controls are missing.

## Remaining Gaps

- Customer-facing enterprise audit portal is not shipped.
- Audit export has a service scaffold but no broad customer download route.
- SSO/SCIM remains provider-integration future work.
- Backup/restore evidence is represented in readiness but should be wired to real drill evidence before enterprise claims.
- Long-term alerting should connect audit/readiness events to the monitoring sink and incident runbooks.
