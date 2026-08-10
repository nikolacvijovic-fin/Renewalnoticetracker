# Founder Support + Beta Reliability Dashboard

NoticeControl has a narrow internal beta-health dashboard at `/admin/beta-health`.

This is an internal founder/operator support surface. It is not customer-facing analytics, not an enterprise admin console, and not an impersonation tool.

## What It Shows

- A bounded, paginated page of beta organizations and activation progress.
- Contract, PDF upload, extraction, review, owner, reminder/email, calendar export, and decision counts for real customer contracts.
- Sample-contract exploration separately from real activation.
- Sample/demo processing issues as diagnostics, without counting them as customer activation.
- Recent customer feedback status by safe reference, type, status, and submitted time.
- Stuck reasons such as failed extraction, deadlines needing review, missing owner, reminder/email setup gaps, missing decision, or unresolved urgent deadlines.
- Links to existing internal ops and audit surfaces with an explicit organization id.
- URL-driven search and filters for sample-only, no real contract, blocked activation, failure states, open feedback, and activated organizations.

The dashboard must not claim population-wide health from a partial page. Page metadata should show the bounded page size and total organization count when the data source provides it.

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

Customer feedback shown to organization members is intentionally limited to reference, type, submitted time, and lifecycle status. Feedback message bodies, internal notes, assignees, and free-text diagnostic details remain internal-only.

## Sample Boundary

- Sample contracts are fictional demo data and never count toward real contract activation.
- Sample contracts are excluded from trusted deadline, owner-assignment, reminder, calendar, and decision activation metrics.
- Sample failures are still visible as sample diagnostics so demo issues are not invisible to support.
- Removed samples must not produce reminder email; scheduled or processing reminders for removed samples should be cancelled or superseded.

## Current Limitations

- This is a beta reliability snapshot, not a full observability platform.
- It uses existing operational rows and bounded queries rather than a dedicated analytics warehouse.
- Some signals, such as calendar export and test email readiness, depend on existing audit/activation events being present.
- The `trial_ending_soon` filter is reserved until trial/billing lifecycle fields are projected into this internal summary.
- There is no customer-visible support-access review portal in this slice.
