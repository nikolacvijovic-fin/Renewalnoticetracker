# Design Partner Beta External Readiness

This checklist separates code/fixture readiness from external verification. It is not legal advice and must be reviewed by qualified security and legal professionals before external publication.

## Required Before First Paid Organization

- [ ] Microsoft publisher verification completed and evidence retained.
- [ ] Google OAuth verification completed for the exact requested scopes.
- [ ] Privacy Policy reviewed by counsel and published.
- [ ] Terms of Service reviewed by counsel and published.
- [ ] Data Processing Addendum reviewed by counsel.
- [ ] Current subprocessor list generated from production configuration and reviewed.
- [ ] Incident-response contacts staffed and tested.
- [ ] Backup and restore evidence reviewed against the production environment.
- [ ] Independent penetration test completed and high-risk findings remediated.
- [ ] Real Microsoft 365 tenant connection, sync, disconnect, and reconnect verified.
- [ ] Real Google Workspace tenant connection, sync, disconnect, and reconnect verified.

## Evidence Classes

- **Fixture validation:** disposable Supabase and mock-provider traffic. Useful for regressions; not provider verification.
- **Real-provider validation:** controlled test tenants using production-equivalent OAuth/application configuration.
- **External assurance:** legal review, penetration testing, publisher/OAuth verification, and contractual evidence.

The paid beta remains invite-only until all mandatory items have named owners, dates, and retained evidence. Documentation or mocked tests alone do not satisfy these checks.
