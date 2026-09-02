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
8. On contract detail, confirm the Opt-Out Clock activation panel lists any remaining trust blockers.
9. Confirm activation is unavailable until one coherent contract has completed human review, a verified notice deadline, reviewed auto-renewal status, and an active organization owner.
10. Explicitly activate the reviewed contract and confirm the resulting software, term, and opt-out window appear once in the SaaS Opt-Out Clock.
11. Repeat activation and confirm the existing linked records are returned without duplicate software, terms, windows, findings, or reminders.
12. Confirm conflicting existing SaaS term data fails closed and remains unchanged for manual resolution.
13. Assign an internal owner.
14. Trigger the internal reminder/test email path and confirm the recipient is internal only.
15. Confirm duplicate reminder delivery keys suppress duplicate sends.
16. Download the contract/urgent ICS export and import it into a calendar client.
17. Record each shipped decision status in staging: renew, terminate/cancel, renegotiate, defer, no action required.
18. Confirm resolved decisions suppress future reminder scheduling.
19. Copy the cancellation notice template and confirm the user must paste/send manually.
20. Copy the renegotiation request template and confirm the user must paste/send manually.
21. Review the audit trail and confirm only safe metadata is recorded.
22. Create or open the sample contract and confirm it is clearly fictional/demo data.
23. Confirm the sample contract does not count as the first real uploaded contract, trusted deadline activation, owner activation, reminder activation, calendar activation, or decision activation.
24. Remove the sample contract and confirm any sample reminders are cancelled or cannot deliver.
25. Submit customer feedback twice quickly and confirm the second submission returns the same safe feedback reference.
26. Submit the same feedback later in a new retry window and confirm it is allowed as a new report.
27. Confirm organization members can see recent feedback references and statuses without message bodies or internal notes.

## Upload Idempotency And Recovery

- Each selected PDF receives a client-generated upload attempt ID; retries reuse that ID rather than filename matching.
- The database serializes claims and permits one contract for an attempt ID. A different organization cannot inspect or reuse the ID.
- Completed attempts return their existing contract and review state. Failed or stale processing attempts may be reclaimed without creating another contract.
- Refresh recovery stores only bounded attempt IDs in browser session storage. Contract content, filenames, organization IDs, storage paths, and provider data are not stored there.
- PDF extraction is still synchronous in the beta request path. The persisted attempt state prevents duplicate contracts and supports status recovery, but it is not a durable background extraction worker. A production background job remains required before claiming resilient long-running processing.

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
- Sample exploration never counts as real activation.
- Repeat feedback is idempotent only for immediate duplicate submissions.
- Customers receive a safe feedback reference and can see organization-scoped feedback status.
