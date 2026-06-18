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

export type CustomerOnboardingSignalContract = {
  auditEvents: readonly string[];
  analyticsEvents: readonly string[];
  monitoringEvents: readonly string[];
};

export type CustomerOnboardingMilestone = {
  id: CustomerOnboardingMilestoneId;
  label: string;
  status: CustomerOnboardingMilestoneStatus;
  ownerSurface: string;
  requiredSignal: CustomerOnboardingSignalContract;
  privacySensitivity: CustomerOnboardingPrivacySensitivity;
  customerVisibleCopyExpectation: string;
  supportFollowUpExpectation: string;
  requiredTestsOrReleaseGates: readonly string[];
  forbiddenBehavior: readonly string[];
};

const commonOnboardingReleaseProof = [
  "tests/customer-onboarding-support-boundary.test.ts",
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
    requiredSignal: {
      auditEvents: ["organization.created", "organization.member_created"],
      analyticsEvents: ["workspace_created"],
      monitoringEvents: []
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
    requiredSignal: {
      auditEvents: ["contract.uploaded", "contracts.imported"],
      analyticsEvents: ["contract_uploaded", "contract_import_completed"],
      monitoringEvents: ["ocr_job_queued"]
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
    requiredSignal: {
      auditEvents: ["contract.reviewed", "contract.trust_changed"],
      analyticsEvents: ["contract_review_completed"],
      monitoringEvents: []
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
    requiredSignal: {
      auditEvents: ["contract.owner_assigned"],
      analyticsEvents: ["owner_assigned"],
      monitoringEvents: []
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
    requiredSignal: {
      auditEvents: ["reminder.trusted", "reminder.activated"],
      analyticsEvents: ["trusted_reminder_ready"],
      monitoringEvents: ["reminder_claimed", "reminder_sent"]
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
    requiredSignal: {
      auditEvents: ["renewal.decision_recorded"],
      analyticsEvents: ["renewal_decision_recorded"],
      monitoringEvents: []
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
    requiredSignal: {
      auditEvents: ["contracts.export_attempted", "contracts.exported"],
      analyticsEvents: ["export_requested"],
      monitoringEvents: ["sync_export_completed", "background_export_completed"]
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
    requiredSignal: {
      auditEvents: ["billing.checkout_completed", "billing.provider_exception_configured"],
      analyticsEvents: ["billing_configured"],
      monitoringEvents: ["billing_webhook_succeeded"]
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
    requiredSignal: {
      auditEvents: ["intelligence.risk_score_viewed", "financial_intelligence.viewed", "procurement_analytics.viewed"],
      analyticsEvents: ["intelligence_surface_viewed"],
      monitoringEvents: ["intelligence_access_denied"]
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
    requiredSignal: {
      auditEvents: ["reminder.acknowledged", "renewal.decision_recorded", "cycle.closed"],
      analyticsEvents: ["renewal_loop_completed"],
      monitoringEvents: []
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
