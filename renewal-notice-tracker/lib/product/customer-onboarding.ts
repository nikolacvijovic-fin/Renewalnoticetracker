export type CustomerOnboardingMilestoneStatus = "shipped" | "deferred" | "future";

export type CustomerOnboardingPrivacySensitivity = "low" | "medium" | "high";

export type CustomerOnboardingMilestoneId =
  | "workspace_created"
  | "first_contract_uploaded"
  | "first_contract_reviewed"
  | "first_owner_assigned"
  | "first_reminder_trusted"
  | "first_decision_recorded"
  | "first_export_completed"
  | "billing_configured"
  | "first_intelligence_viewed"
  | "renewal_loop_completed";

export type CustomerOnboardingEvidenceContract = {
  shippedEvidenceEvents: readonly string[];
  futureEvidenceEvents: readonly string[];
  stateOrQueryFallbacks: readonly string[];
};

export type CustomerOnboardingMilestone = {
  id: CustomerOnboardingMilestoneId;
  label: string;
  status: CustomerOnboardingMilestoneStatus;
  ownerSurface: string;
  evidence: CustomerOnboardingEvidenceContract;
  privacySensitivity: CustomerOnboardingPrivacySensitivity;
  customerVisibleCopyExpectation: string;
  supportFollowUpExpectation: string;
  requiredTestsOrReleaseGates: readonly string[];
  forbiddenBehavior: readonly string[];
};

const commonOnboardingReleaseProof = [
  "tests/customer-onboarding-support-boundary.test.ts",
  "tests/event-taxonomy-onboarding-support.test.ts",
  "future customer onboarding/support success release gate required before expansion"
] as const;

export const CUSTOMER_ONBOARDING_MILESTONES: Record<
  CustomerOnboardingMilestoneId,
  CustomerOnboardingMilestone
> = {
  workspace_created: {
    id: "workspace_created",
    label: "Workspace created",
    status: "shipped",
    ownerSurface: "auth callback and active organization setup",
    evidence: {
      shippedEvidenceEvents: ["auth_signup_completed", "trial.started"],
      futureEvidenceEvents: ["organization.created", "organization.member_created"],
      stateOrQueryFallbacks: ["active_organization_membership_query", "organization_created_at_query"]
    },
    privacySensitivity: "low",
    customerVisibleCopyExpectation: "Confirm the workspace exists and guide the operator to upload the first contract.",
    supportFollowUpExpectation: "Support may verify organization ID, plan, and member count only.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not infer adoption from signup alone.", "Do not expose internal setup notes to customers."]
  },
  first_contract_uploaded: {
    id: "first_contract_uploaded",
    label: "First contract uploaded",
    status: "shipped",
    ownerSurface: "contract upload/import",
    evidence: {
      shippedEvidenceEvents: [
        "contract.created",
        "contract.manual_created",
        "contracts.imported",
        "contract_upload_completed",
        "import_completed"
      ],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["organization_scoped_contract_count", "contract_processing_status_summary"]
    },
    privacySensitivity: "high",
    customerVisibleCopyExpectation: "Explain that uploaded contracts must still be reviewed before workflow trust.",
    supportFollowUpExpectation: "Support can inspect upload status, failure codes, and job IDs, not document contents.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not show raw uploaded contract text in support views.", "Do not treat upload as reviewed truth."]
  },
  first_contract_reviewed: {
    id: "first_contract_reviewed",
    label: "First contract reviewed",
    status: "shipped",
    ownerSurface: "P0 review workflow",
    evidence: {
      shippedEvidenceEvents: ["contract.review_updated", "contract_review_completed"],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["reviewed_contract_count", "contract_metadata_needs_review_query"]
    },
    privacySensitivity: "medium",
    customerVisibleCopyExpectation: "Make clear that reviewed P0 fields become workflow-ready evidence.",
    supportFollowUpExpectation: "Support can inspect review status and reviewer IDs, not raw evidence text.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not let support interpret review state live as normal workflow."]
  },
  first_owner_assigned: {
    id: "first_owner_assigned",
    label: "First owner assigned",
    status: "shipped",
    ownerSurface: "owner assignment workflow",
    evidence: {
      shippedEvidenceEvents: ["contract_owner_assigned"],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["owner_assignment_coverage_query", "contracts_missing_owner_query"]
    },
    privacySensitivity: "medium",
    customerVisibleCopyExpectation: "Explain that an accountable owner is required before trusted reminders.",
    supportFollowUpExpectation: "Support can inspect owner coverage counts and missing-owner contract IDs.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not assign owners silently on behalf of customers outside audited workflows."]
  },
  first_reminder_trusted: {
    id: "first_reminder_trusted",
    label: "First reminder trusted",
    status: "shipped",
    ownerSurface: "trusted reminder activation",
    evidence: {
      shippedEvidenceEvents: ["reminder.created", "reminder_scheduled", "reminder_claimed", "reminder_sent"],
      futureEvidenceEvents: ["reminder.trusted", "reminder.activated"],
      stateOrQueryFallbacks: ["trusted_reminder_count_query", "reminder_blocking_reason_summary"]
    },
    privacySensitivity: "medium",
    customerVisibleCopyExpectation: "Show that reminders activate only after review, owner, and trust gates.",
    supportFollowUpExpectation: "Support can inspect reminder status, delivery code, and retry state.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not manually trigger reminders as hidden rescue.", "Do not hide blocked-state reasoning."]
  },
  first_decision_recorded: {
    id: "first_decision_recorded",
    label: "First decision recorded",
    status: "shipped",
    ownerSurface: "renewal decision workflow",
    evidence: {
      shippedEvidenceEvents: ["renewal_decision.created", "renewal_decision_recorded"],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["renewal_decision_status_query", "latest_decision_by_contract_query"]
    },
    privacySensitivity: "medium",
    customerVisibleCopyExpectation: "Frame decisions as workflow records, not legal advice.",
    supportFollowUpExpectation: "Support can inspect decision status and timestamp, not advise what decision to make.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not recommend legal action.", "Do not let support record decisions outside customer action paths."]
  },
  first_export_completed: {
    id: "first_export_completed",
    label: "First export completed",
    status: "shipped",
    ownerSurface: "export/reporting presets",
    evidence: {
      shippedEvidenceEvents: [
        "contracts.export_attempted",
        "contracts.exported",
        "contracts.export_background_completed",
        "export_requested",
        "export_sync_completed",
        "export_background_completed"
      ],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["export_request_status_query", "latest_export_artifact_status_query"]
    },
    privacySensitivity: "high",
    customerVisibleCopyExpectation: "Explain which export preset was used and whether sensitive sections were included.",
    supportFollowUpExpectation: "Support can inspect preset, format, row count, artifact status, and failure codes.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not include notes/intelligence/audit details in basic exports.", "Do not expose storage paths."]
  },
  billing_configured: {
    id: "billing_configured",
    label: "Billing configured",
    status: "shipped",
    ownerSurface: "billing settings and support-led exceptions",
    evidence: {
      shippedEvidenceEvents: [
        "billing.checkout_started",
        "billing.webhook_synced",
        "billing_checkout_started",
        "checkout_completed",
        "billing_webhook_succeeded"
      ],
      futureEvidenceEvents: ["billing.provider_exception_configured"],
      stateOrQueryFallbacks: ["canonical_billing_snapshot", "support_led_billing_provider_policy_query"]
    },
    privacySensitivity: "high",
    customerVisibleCopyExpectation: "Distinguish Paddle self-serve billing from support-led PayPal/manual invoice exceptions.",
    supportFollowUpExpectation: "Support can inspect provider/status labels and exception state, not raw provider payloads.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not infer entitlement from provider label.", "Do not show fake billing portals for exception billing."]
  },
  first_intelligence_viewed: {
    id: "first_intelligence_viewed",
    label: "First intelligence viewed",
    status: "shipped",
    ownerSurface: "risk, financial, and procurement intelligence surfaces",
    evidence: {
      shippedEvidenceEvents: [
        "intelligence.risk_badge_viewed",
        "intelligence.risk_explanation_viewed",
        "intelligence.risk_queue_viewed",
        "intelligence.financial_viewed",
        "intelligence.procurement_viewed"
      ],
      futureEvidenceEvents: [],
      stateOrQueryFallbacks: ["intelligence_surface_access_map", "canonical_billing_snapshot"]
    },
    privacySensitivity: "high",
    customerVisibleCopyExpectation: "Show confidence/trust labels and action links instead of pretending finance/procurement/legal authority.",
    supportFollowUpExpectation: "Support can inspect access denial codes and trust labels, not raw evidence or hidden calculations.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not log fake recalculation events on passive view.", "Do not expose intelligence outside entitlement gates."]
  },
  renewal_loop_completed: {
    id: "renewal_loop_completed",
    label: "Renewal loop completed",
    status: "shipped",
    ownerSurface: "acknowledgment, decision, close/reopen workflow",
    evidence: {
      shippedEvidenceEvents: [
        "contract.acknowledged",
        "contract.acknowledged_from_email",
        "acknowledgment_recorded",
        "renewal_decision.created",
        "renewal_decision_recorded",
        "renewal_cycle.updated"
      ],
      futureEvidenceEvents: ["cycle.closed"],
      stateOrQueryFallbacks: ["cycle_status_closed_or_reopened_query", "renewal_loop_completion_summary_query"]
    },
    privacySensitivity: "medium",
    customerVisibleCopyExpectation: "Celebrate a completed renewal-control loop without implying full CLM completion.",
    supportFollowUpExpectation: "Support can inspect workflow completion counts and missing-step blockers.",
    requiredTestsOrReleaseGates: commonOnboardingReleaseProof,
    forbiddenBehavior: ["Do not claim negotiation, approval, e-signature, or CLM completion."]
  }
} as const;

export const CUSTOMER_ONBOARDING_MILESTONE_IDS = Object.keys(
  CUSTOMER_ONBOARDING_MILESTONES
) as CustomerOnboardingMilestoneId[];
