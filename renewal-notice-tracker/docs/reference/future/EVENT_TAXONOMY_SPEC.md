# Event Taxonomy Spec

## Naming Conventions
- Use snake_case only.
- Use domain-first action names like `contract_review_completed`, `reminder_failed`, `billing_checkout_started`.
- Prefer explicit lifecycle verbs: `viewed`, `clicked`, `created`, `completed`, `failed`, `assigned`, `recorded`, `blocked`.
- Do not create synonym events for the same action.

## Event Categories
- auth
- onboarding
- contract workflow
- commercial and billing
- retention and churn
- reliability and debug

## Property Conventions
- Use snake_case property names.
- Use `*_id` for identifiers, `*_at` for timestamps, and `*_count` for counts.
- Keep enums controlled for `source`, `prompt_context`, `signal_type`, `creation_method`, `decision_status`, and `channel`.
- Use explicit nullable fields rather than inconsistent omission.

## Required Global Properties
- `event_id`
- `event_name`
- `event_version`
- `occurred_at`
- `organization_id`
- `plan_tier`
- `actor_type`
- `source`

## Entity IDs To Track
- `organization_id`
- `user_id`
- `session_id`
- `contract_id`
- `import_job_id`
- `reminder_id`
- `notification_log_id`
- `rule_id`
- `playbook_id`
- `decision_id`
- `billing_customer_id`
- `checkout_session_id`

## Context Rules
- Include `organization_id` on every possible event.
- Include `user_id` on user-driven events.
- Use `actor_type=system` for cron, webhooks, retries, and background jobs.
- Include `session_id` for web funnel events.
- Include `plan_tier` on commercial and gated workflow events.

## Deduplication And Idempotency
- Use `event_id` as the primary unique key.
- Use `idempotency_key + event_name` for retry-prone jobs and webhooks.
- Emit one canonical success event and one canonical failure event per action.
- Log admin rescue actions separately from automated retries.

## Versioning Rules
- Every event includes `event_version`.
- Increase the version when required properties or semantics change.
- Prefer additive optional properties over breaking property redefinitions.

## Data Quality Rules
- Reject events missing `organization_id` unless they are truly pre-workspace marketing events.
- Reject commercial events missing `plan_tier`.
- Require `contract_id` for contract-specific workflow events.
- Normalize enums before persistence.
- Keep `source` and `prompt_context` controlled.

## Detailed Event Table
- `auth_signup_completed`: workspace lifecycle start; actor `user`; entity `organization`; use for attribution and activation.
- `onboarding_step_completed`: onboarding milestone finished; actor `user`; entity `organization`; use for funnel analysis.
- `contract_upload_completed`: upload succeeds; actor `user`; entity `contract`; use for activation and source quality.
- `manual_contract_creation_attempted`: manual creation submitted; actor `user`; entity `contract`; use for high-intent workflow usage.
- `import_completed`: spreadsheet import finishes; actor `system`; entity `import_job`; use for migration success and expansion.
- `import_failed`: spreadsheet import fails; actor `system`; entity `import_job`; use for onboarding friction and support burden.
- `extraction_completed`: AI extraction finishes; actor `system`; entity `contract`; use for cost and trust analysis.
- `extraction_failed`: AI extraction fails; actor `system`; entity `contract`; use for reliability and cost leakage.
- `contract_review_completed`: review submitted; actor `user`; entity `contract`; use for trust milestone measurement.
- `contract_owner_assigned`: owner assigned; actor `user`; entity `contract`; use for embedding and retention.
- `reminder_created`: reminder saved; actor `user`; entity `reminder`; use for workflow activation.
- `multi_recipient_reminder_denied`: gated coordination attempt blocked; actor `system`; entity `reminder`; use for upgrade logic.
- `escalation_rule_created`: routing/escalation rule saved; actor `user`; entity `rule`; use for Growth maturity.
- `playbook_applied`: playbook attached; actor `user`; entity `playbook`; use for process standardization.
- `renewal_decision_recorded`: renewal decision saved; actor `user`; entity `decision`; use for deep retention.
- `export_requested`: export requested; actor `user`; entity `organization`; use for reporting intent.
- `digest_sent`: digest delivered; actor `system`; entity `organization`; use for recurring reporting loops.
- `pricing_page_viewed`: pricing page loaded; actor `user_or_anonymous`; entity `session`; use for top-of-funnel monetization intent.
- `upgrade_prompt_clicked`: upgrade CTA clicked; actor `user`; entity `organization`; use for prompt performance.
- `billing_checkout_started`: checkout session created; actor `user`; entity `checkout_session`; use for hard purchase intent.
- `checkout_completed`: paid conversion confirmed; actor `system`; entity `organization`; use for core revenue.
- `plan_cancelled`: cancellation or cancel-at-period-end recorded; actor `user_or_system`; entity `organization`; use for churn.
- `reminder_failed`: reminder delivery fails; actor `system`; entity `reminder`; use for trust and reliability.
- `workflow_error_recorded`: notable workflow error logged; actor `system`; entity `workflow`; use for tying failures to customer risk.
- `account_inactivity_flagged`: inactivity threshold crossed; actor `system`; entity `organization`; use for churn warning.
- `admin_debug_viewed`: operator opens admin/debug; actor `user`; entity `organization`; use for rescue-burden analysis.
