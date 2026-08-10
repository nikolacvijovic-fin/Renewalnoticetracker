# Founder Support + Beta Reliability Dashboard

NoticeControl has a narrow internal beta-health dashboard at `/admin/beta-health`.

This is an internal founder/operator support surface. It is not customer-facing analytics, not an enterprise admin console, and not an impersonation tool.

## What It Shows

- Beta organizations and activation progress.
- Contract, PDF upload, extraction, review, owner, reminder/email, calendar export, and decision counts.
- Stuck reasons such as failed extraction, deadlines needing review, missing owner, reminder/email setup gaps, missing decision, or unresolved urgent deadlines.
- Links to existing internal ops and audit surfaces with an explicit organization id.

## Access Boundary

- The page requires `requireInternalRole(["internal_admin", "internal_support"])` server-side.
- Regular customer users and organization members cannot access cross-organization beta health data.
- Assist links do not impersonate customers or bypass organization scoping.

## Privacy Boundary

The dashboard and repository must not select or display:

- Raw contract text.
- OCR output.
- Raw extracted clauses.
- Provider payloads.
- Storage paths.
- Notification recipients.
- Private notes.
- Email bodies.
- Secrets, tokens, or debug traces.

The support-note helper stores a short `safe_note` and allowlisted metadata only. Customer RLS is closed for `beta_support_notes`; writes are intended for internal service-role repository paths.

## Current Limitations

- This is a beta reliability snapshot, not a full observability platform.
- It uses existing operational rows and bounded queries rather than a dedicated analytics warehouse.
- Some signals, such as calendar export and test email readiness, depend on existing audit/activation events being present.
- There is no customer-visible support-access review portal in this slice.
