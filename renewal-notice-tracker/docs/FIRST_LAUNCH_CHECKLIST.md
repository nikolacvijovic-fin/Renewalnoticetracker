# First Launch Checklist

This is the operator checklist for the current shipped scope. It does not approve legal, provider, or
production evidence on behalf of an operator.

## A. Before staging

- Main CI is green and the staging deployment uses the provider-neutral runtime in
  [PRODUCTION_RUNTIME.md](PRODUCTION_RUNTIME.md): web, PDF worker, reminder worker, and exactly one scheduler.
- Staging infrastructure is deployed; authenticated readiness and worker/scheduler heartbeats are healthy.
- Staging migrations are planned, reviewed, and applied using the forward-only procedure in
  [DEPLOYMENT_RELEASE_SAFETY.md](DEPLOYMENT_RELEASE_SAFETY.md).
- Run `npm run release:staging-preflight`, then prepare the synthetic PDF with
  `npm run staging:fixtures:prepare`; complete the documented manual user/session and contract prerequisites
  in [P0_E2E_STAGING_SETUP.md](P0_E2E_STAGING_SETUP.md).
- The manual Release Readiness workflow is green, including its required SaaS PDF proof.

## B. Before first design partner

- Confirm real email delivery plus SPF, DKIM, DMARC, bounce/suppression webhook handling, and a controlled
  Paddle test or billing journey appropriate to the partner.
- Verify monitoring alerts are delivered, complete a backup/restore drill, and rehearse operator/support
  recovery using [OPERATIONAL_RUNBOOKS.md](OPERATIONAL_RUNBOOKS.md).
- Confirm normal recovery needs no hidden founder database edit or manual rescue.

## C. Before first paid customer

The following must be evidenced externally; this checklist does not mark any as complete:

- Microsoft publisher verification and Google OAuth verification.
- Privacy Policy, Terms, and DPA legal review/publication; subprocessor review.
- Incident-response staffing/test, production backup/restore evidence, and an independent penetration test with
  high-risk remediation.
- Real Microsoft 365 and Google Workspace connect, sync, disconnect, and reconnect journeys.
- Two weeks of operator-autonomy evidence, per [TWO_WEEK_AUTONOMY_GATE.md](TWO_WEEK_AUTONOMY_GATE.md).
