export const SHIPPED_KERNEL = {
  workflowLoop: [
    "upload_or_import",
    "review_p0",
    "assign_owner",
    "trusted_reminder",
    "acknowledgment",
    "decision",
    "closure"
  ],
  routes: [
    "/",
    "/pricing",
    "/services",
    "/dashboard",
    "/dashboard/risk-queue",
    "/dashboard/financial-intelligence",
    "/dashboard/procurement-analytics",
    "/dashboard/saas-opt-out-clock",
    "/dashboard/contracts",
    "/dashboard/contracts/new",
    "/dashboard/contracts/[id]",
    "/dashboard/contracts/export/csv",
    "/dashboard/contracts/export/xlsx",
    "/dashboard/contracts/import-template",
    "/dashboard/contracts/imports/[id]/errors",
    "/dashboard/settings",
    "/dashboard/contracts/[id]/ics",
    "/internal/ops"
  ],
  components: [
    "UploadContractForm",
    "ContractsTable",
    "RiskBadge",
    "RiskExplanationDrawer",
    "RiskQueueFilters",
    "RiskQueueTable",
    "ReviewForm",
    "ContractWorkflowSummary",
    "ReminderTimeline",
    "RenewalDecisionForm",
    "ContractCycleActions",
    "NoteForm",
    "ContractActivityFeed",
    "OperationalPriorityPanel",
    "FinancialExposureCard",
    "FinancialExposureBreakdown",
    "ProcurementAnalyticsFilters",
    "ProcurementActionList",
    "SaasOptOutClockPage",
    "OnboardingChecklist",
    "SettingsForm",
    "AdminPanel"
  ],
  actions: [
    "createContractAction",
    "createManualContractAction",
    "importContractsAction",
    "updateContractReviewAction",
    "acknowledgeContractAction",
    "createRenewalDecisionAction",
    "updateRenewalCycleAction",
    "createNoteAction",
    "saveProfileSettingsAction",
    "setActiveOrganizationAction",
    "requestWorkspaceDeletionAction"
  ],
  apis: [
    "/api/extract",
    "/api/reminders",
    "/api/billing/checkout",
    "/api/billing/manage"
  ],
  reports: [
    "reviewed_coverage",
    "owner_coverage",
    "due_soon_exposure",
    "decision_gaps",
    "renewal_exposure_30_60_90_180_days",
    "auto_renewal_exposure",
    "unowned_exposure",
    "undecided_exposure",
    "unreviewed_exposure",
    "price_change_exposure",
    "cfo_opt_out_clock",
    "saas_opt_out_urgency",
    "saas_contract_risk_findings",
    "exposure_by_counterparty",
    "exposure_by_department",
    "exposure_by_owner",
    "top_vendors_by_upcoming_renewal_exposure",
    "vendor_contracts_due_soon",
    "owner_gaps_by_department",
    "decision_gaps_by_owner",
    "auto_renewals_needing_decision",
    "duplicate_counterparty_cleanup",
    "renewal_outcome_history"
  ],
  commercialSurfaces: [
    "starter_plan",
    "growth_plan",
    "portfolio_plan",
    "paddle_checkout",
    "manual_invoice_exception_support",
    "onboarding_service",
    "import_cleanup_service",
    "renewal_ops_setup_service"
  ]
} as const;

export type ShippedKernelRoute = (typeof SHIPPED_KERNEL.routes)[number];

export function isShippedKernelRoute(pathname: string) {
  return (SHIPPED_KERNEL.routes as readonly string[]).includes(pathname);
}
