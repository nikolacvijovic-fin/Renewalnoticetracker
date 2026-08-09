# PDF Renewal Control Beta QA

This checklist validates the first customer path without adding vendor sending, integrations, CRM, outreach automation, or CLM workflows.

## Safe Demo Fixture

Use obviously fake staging data only:

| Scenario | Expected setup |
| --- | --- |
| Urgent contract | PDF contract with trusted notice deadline due in 7 days |
| Missing deadline | Contract metadata has no notice deadline |
| Weak extraction | PDF extraction proposes a deadline with low confidence and `needs_review` |
| Assigned owner | Contract has an internal owner with a notification email |
| Resolved decision | Contract has a terminal/resolved renewal decision |
| Accepted risk | Contract has reviewed/accepted weak evidence through the existing trust path |
| High spend | Contract value is at or above the high-spend threshold |

Do not use real customer contracts, private notes, email bodies, provider payloads, scraped contacts, or vendor email addresses in QA fixtures.

## Manual Flow

1. Sign in to a staging organization with an owner/admin/operator test user.
2. Upload a fake PDF contract.
3. Confirm extraction creates contract metadata and short field-level evidence snippets.
4. Confirm weak or inferred critical fields are marked `needs_review`.
5. Correct the notice deadline and complete review.
6. Confirm the trusted deadline appears on the dashboard urgent list.
7. Confirm weak or missing deadlines are shown as review blockers, not trusted deadline urgency.
8. Confirm the contract appears in the SaaS Opt-Out Clock only when the SaaS Renewal Defense path has reviewed/trusted data.
9. Assign an internal owner.
10. Trigger the internal reminder/test email path and confirm the recipient is internal only.
11. Confirm duplicate reminder delivery keys suppress duplicate sends.
12. Download the contract/urgent ICS export and import it into a calendar client.
13. Record each shipped decision status in staging: renew, terminate/cancel, renegotiate, defer, no action required.
14. Confirm resolved decisions suppress future reminder scheduling.
15. Copy the cancellation notice template and confirm the user must paste/send manually.
16. Copy the renegotiation request template and confirm the user must paste/send manually.
17. Review the audit trail and confirm only safe metadata is recorded.

## No-Send Boundary

NoticeControl must not:

- Send vendor cancellation notices.
- Send renegotiation emails to vendors.
- Look up vendor or scraped contact recipients.
- Create outreach sequences or cadences.
- Store generated template bodies in audit logs.
- Mark a notice as sent when a template is copied.

The only allowed action in this slice is manual copy by the logged-in user.

## Error And Empty States

Validate these states use clear, short copy:

- No contracts uploaded.
- Extraction failed.
- No notice deadline found.
- Reminder email not configured.
- Owner has no notification email.
- ICS export has no eligible trusted dates.
- Decision is already resolved.
- Unauthorized or cross-organization action is blocked.

## Beta Acceptance Criteria

The MVP is beta-ready when:

- A user can complete upload, extraction, review, dashboard, owner, reminder, ICS, decision, and copy-template steps without developer help.
- Weak AI dates are never treated as trusted operational deadlines before review.
- Internal reminder email works or fails with a clear internal-only message.
- Calendar export produces valid `.ics` content.
- Owner assignment and decision tracking remain organization-scoped.
- Cancellation and renegotiation templates are copy-only.
- Audit events contain safe metadata only.
- No reviewed path enables vendor sending or cross-organization access.
