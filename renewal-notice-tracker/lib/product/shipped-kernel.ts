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
    "ReviewForm",
    "ContractWorkflowSummary",
    "ReminderTimeline",
    "RenewalDecisionForm",
    "ContractCycleActions",
    "NoteForm",
    "ContractActivityFeed",
    "OperationalPriorityPanel",
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
    "decision_gaps"
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
