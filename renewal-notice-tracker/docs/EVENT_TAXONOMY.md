# Event Taxonomy

Canonical code source: `lib/product/event-taxonomy.ts`.

This taxonomy maps onboarding and support-success evidence to actual NoticeControl event names. It is not a new analytics system and it does not add emitted events by itself. Its job is to say which events are emitted today, which are future/deferred, where they come from, and which metadata is safe.

## Evidence Rules

- Shipped evidence must reference events marked as emitted today in `lib/product/event-taxonomy.ts`.
- Future evidence must be marked `emittedToday: false` and must not be treated as live instrumentation.
- State/query fallback evidence may be used when the product has reliable stored state but no exact event today.
- Customer onboarding progress in `lib/product/customer-onboarding-progress.ts` may complete milestones from shipped event evidence or durable state/query fallback evidence only; future/deferred event contracts do not complete customer-visible progress.
- Safe metadata may include IDs, counts, status values, failure codes, categories, timestamps, route/action context, and bounded plan/provider labels.
- Event metadata must never include raw contract text, full notes, OCR output, raw extracted evidence, provider payloads, storage paths, tokens, secrets, full billing payloads, raw customer files, uploaded document contents, email bodies, or debug traces.

## Current Shipped Event Evidence

These events are emitted by current audit, analytics, monitoring, or operational paths:

- `auth_signup_completed`
- `trial.started`
- `contract.created`
- `contract.manual_created`
- `contracts.import_started`
- `contracts.imported`
- `contract_upload_completed`
- `import_started`
- `import_completed`
- `import_failed`
- `extraction_completed`
- `extraction_failed`
- `contract.review_updated`
- `contract_review_completed`
- `contract_owner_assigned`
- `reminder.created`
- `reminder.blocked`
- `reminder_scheduled`
- `reminder_claimed`
- `reminder_sent`
- `reminder_failed`
- `reminder_retry_scheduled`
- `reminder_terminal_failed`
- `reminder_stale_rescued`
- `reminder_dispatch_failed`
- `trusted_reminder_delivery.enqueued`
- `trusted_reminder_delivery.claimed`
- `trusted_reminder_delivery.sent`
- `trusted_reminder_delivery.retry_scheduled`
- `trusted_reminder_delivery.dead_lettered`
- `trusted_reminder_delivery.cancelled`
- `trusted_reminder_delivery.blocked_by_gate`
- `contract_extraction.requested`
- `contract_extraction.completed`
- `contract_extraction.failed`
- `contract_extracted_field.accepted`
- `contract_extracted_field.rejected`
- `contract_extracted_fields.applied_to_metadata`
- `renewal_quote_comparison.created`
- `renewal_quote_comparison.completed`
- `renewal_quote_comparison.failed`
- `renewal_quote_finding.reviewed`
- `savings_opportunity.created`
- `savings_opportunity.dismissed`
- `savings_opportunity.realized`
- `renewal_decision_recorded`
- `contract.acknowledged`
- `contract.acknowledged_from_email`
- `acknowledgment_recorded`
- `renewal_cycle.updated`
- `note.created`
- `contracts.export_denied`
- `contracts.export_attempted`
- `contracts.exported`
- `export_requested`
- `export_sync_attempted`
- `export_sync_completed`
- `export_sync_failed`
- `export_sync_rejected`
- `export_preflight_rejected`
- `export_too_large`
- `export_failed`
- `contracts.export_background_requested`
- `contracts.export_background_completed`
- `contracts.export_background_failed`
- `contracts.export_background_downloaded`
- `contracts.export_background_expired`
- `export_background_requested`
- `export_background_claimed`
- `export_background_completed`
- `export_background_failed`
- `export_background_downloaded`
- `export_background_download_failed`
- `export_background_expired`
- `export_background_cleanup_failed`
- `ocr_job_claimed`
- `ocr_job_stale_rescued`
- `ocr_job_completed`
- `ocr_job_failed`
- `ocr_job_retry_scheduled`
- `ocr_job_terminal_failed`
- `billing.checkout_started`
- `billing_checkout_started`
- `checkout_completed`
- `billing.webhook_synced`
- `billing_webhook_received`
- `billing_webhook_succeeded`
- `billing_webhook_replayed`
- `billing_webhook_failed`
- `intelligence.financial_viewed`
- `intelligence.procurement_viewed`
- `intelligence.risk_queue_viewed`
- `intelligence.risk_badge_viewed`
- `intelligence.risk_explanation_viewed`
- `intelligence.access_denied`
- `intelligence_access_denied`
- `internal_route_auth_failed`
- `workspace_deletion_route_failed`
- `export_jobs_route_failed`
- `privacy.workspace_deletion_requested`
- `internal_rescue_action_recorded`
- `admin.notification_resent`
- `admin.reminder_rerun`

## Future Or Deferred Event Evidence

These events are registry contracts only. They must not be counted as live evidence until the emitting code exists and tests prove it.

- `organization.created`
- `organization.member_created`
- `renewal_decision.created`
- `reminder.trusted`
- `reminder.activated`
- `cycle.closed`
- `billing.provider_exception_configured`
- `intelligence.risk_score_recalculated`
- `intelligence.export_requested`
- `intelligence.settings_changed`
- `privacy.workspace_deletion_scheduled`
- `privacy.workspace_deletion_executed`
- `privacy.workspace_deletion_failed`
- `identity.sso_config_changed`
- `identity.sso_callback_prepared`
- `identity.scim_directory_configured`
- `identity.scim_user_provisioned`
- `identity.scim_user_updated`
- `identity.scim_user_deprovisioned`
- `identity.member_locked`
- `identity.member_unlocked`
- `identity.group_role_mapping_changed`
- `identity.break_glass_policy_checked`
- `enterprise.identity_provider_configured`
- `enterprise.sso_config_changed`
- `enterprise.sso_configured`
- `enterprise.sso_enabled`
- `enterprise.sso_disabled`
- `enterprise.idp_metadata_changed`
- `enterprise.domain_verification_started`
- `enterprise.domain_verification_completed`
- `enterprise.domain_verification_failed`
- `enterprise.scim_user_provisioned`
- `enterprise.scim_user_updated`
- `enterprise.scim_user_deprovisioned`
- `enterprise.identity_member_locked`
- `enterprise.identity_member_unlocked`
- `enterprise.role_group_mapping_changed`
- `enterprise.admin_recovery_used`
- `enterprise.break_glass_admin_preserved`
- `enterprise.break_glass_admin_blocked`
- `enterprise.user_lockout`
- `enterprise.user_recovery`
- `governance.retention_policy_changed`
- `governance.legal_hold_created`
- `governance.legal_hold_released`
- `exports.artifact_expired`
- `exports.artifact_deleted`
- `governance.customer_data_export_requested`
- `governance.customer_data_export_completed`
- `governance.support_access_reviewed`
- `support.escalation_opened`
- `support.enterprise_security_review_requested`

The `identity.*` event family is the newer canonical runtime policy/audit contract for future provider-backed identity workflows. The older `enterprise.*` identity event family remains documented as future/deferred compatibility contract language until real SSO/SCIM emitters exist and one family can be intentionally promoted or retired.

## Onboarding Evidence

`lib/product/customer-onboarding.ts` uses this taxonomy for milestone evidence:

- `workspace_created` uses shipped events such as `auth_signup_completed`, future organization lifecycle events, and active organization state fallbacks.
- `first_contract_uploaded` uses contract creation/import analytics and audit evidence plus organization-scoped contract counts.
- `first_contract_reviewed` uses `contract_review_completed`, `contract.review_updated`, and reviewed-contract state.
- `first_owner_assigned` uses `contract_owner_assigned` and owner coverage queries.
- `first_reminder_trusted` uses reminder creation/scheduling/dispatch evidence, future explicit trust events, and reminder trusted-state queries.
- `first_decision_recorded` uses `renewal_decision_recorded` and decision state queries. `renewal_decision.created` is future audit vocabulary only.
- `first_export_completed` uses sync/background export completion evidence and export request state.
- `billing_configured` uses billing checkout/webhook evidence plus the canonical billing snapshot.
- `first_intelligence_viewed` uses actual intelligence view audit events plus shared access-map state.
- `renewal_loop_completed` uses acknowledgment, decision, and cycle update evidence plus workflow summary state.

## Support Signal Evidence

`lib/product/support-success.ts` uses this taxonomy to declare whether each signal is computable today or future-only.

Computable today:

- `no_contract_uploaded_after_signup`
- `contracts_uploaded_but_unreviewed`
- `contracts_without_owner`
- `reminders_not_trusted`
- `decisions_missing`
- `export_failed_repeatedly`
- `billing_exception_needs_followup`
- `ocr_queue_delayed`

Future-only:

- `support_escalation_open`
- `enterprise_security_review_pending`

The future-only signals remain internal planning contracts. They do not ship support dashboards, customer health scores, support impersonation, or raw-data diagnostic tooling.
