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

Authoritative event writes go through `lib/enterprise-audit/audit-recorder.ts`. Domain code should not insert directly into enterprise event tables.

Recorder routing:

- `trusted_reminder` -> `trusted_reminder_gate_events`
- `trust_exception` -> `trust_exception_approval_events`
- `renewal_decision` -> `renewal_decision_events`
- contract/evidence/import/system events -> `contract_audit_events`
- auth/billing/admin compatibility events -> `audit_logs`

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
- Trusted reminder delivery enqueued, claimed, sent, retried, dead-lettered, cancelled, or blocked by the gate
- Contract extraction requested, completed, failed, field accepted, field rejected, or accepted fields applied to metadata
- Renewal quote comparison created, completed, failed, finding reviewed, and savings opportunity events
- Evidence review events
- Reminder gate blocker transitions

Contract detail now includes a compact enterprise trust timeline so reviewers can see why a reminder is trusted or blocked without reading raw internal metadata.

Renewal quote comparison events are evidence events. They can identify commercial risk and savings opportunities, but they do not automatically update contract metadata, create negotiation instructions, or mark a renewal decision as trusted.

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
- Normalized event lookup uses `source:id` and queries the exact source table with `organization_id`.
- Category and actor count helpers are currently marked partial because they derive from a capped normalized sample. Admin UI labels these counts honestly until exact aggregate views/RPCs are added.

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

`lib/enterprise-readiness/enterprise-readiness-evidence.ts` collects runtime evidence for readiness controls. `lib/enterprise-readiness/enterprise-readiness-score.ts` computes a conservative score from that collected evidence.

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

Unknown or unverified controls are treated as failed or warning evidence. Admin pages must not pass caller-supplied optimistic booleans directly into the score.

## Trust Approval Authority

Trust exception approval authority is enforced in two layers:

- Trusted TypeScript service code computes `evidence_confidence_at_approval` from current contract metadata.
- Migration `202607190001_enterprise_trust_authority.sql` removes direct client insert/update authority and enforces one non-revoked approval per organization, contract, and approval type.

The approval table remains readable to scoped organization members, but create/revoke authority is server/service-role only.

## Remaining Gaps

- Customer-facing enterprise audit portal is not shipped.
- Audit export has a service scaffold but no broad customer download route.
- Exact category/actor audit count aggregates should be implemented with SQL views or RPCs before presenting totals as complete.
- Background job health is now visible internally, but exact queue metrics should move to aggregate views/RPCs before high-volume enterprise operations.
- SSO/SCIM remains provider-integration future work.
- Backup/restore evidence is represented in readiness but should be wired to real drill evidence before enterprise claims.
- Long-term alerting should connect audit/readiness events to the monitoring sink and incident runbooks.
