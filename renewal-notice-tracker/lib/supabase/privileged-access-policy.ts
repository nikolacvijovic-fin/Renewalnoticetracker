export const APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS = [
  "lib/analytics/repositories/admin-analytics-repository.ts",
  "lib/audit/repositories/admin-audit-repository.ts",
  "lib/background-jobs/repositories/admin-background-jobs-repository.ts",
  "lib/contract-intelligence/repositories/admin-extraction-repository.ts",
  "lib/enterprise-audit/repositories/admin-enterprise-audit-repository.ts",
  "lib/billing/service.ts",
  "lib/commercial/capacity-snapshot.ts",
  "lib/commercial/readiness-snapshot.ts",
  "lib/contracts/background-exports.ts",
  "lib/contracts/export-route.ts",
  "lib/contracts/repositories/admin-processing-errors-repository.ts",
  "lib/contracts/repositories/admin-trust-exception-approvals-repository.ts",
  "lib/contracts/queries.ts",
  "lib/email/actions.ts",
  "lib/internal/repositories/admin-ops-evidence-repository.ts",
  "lib/notifications/reminders.ts",
  "lib/ocr/jobs.ts",
  "lib/organization/scoped-admin.ts",
  "lib/organization/workspace-deletion.ts",
  "lib/quote-comparison/repositories/admin-quote-comparison-repository.ts",
  "lib/supabase/privileged.ts"
] as const;

export const PRIVILEGED_ACCESS_POLICY = {
  canonicalWrapper: "lib/supabase/privileged.ts",
  directImportPolicy:
    "Existing direct service-role imports are allowlisted only as temporary compatibility. New privileged code must use a scoped domain repository; broad action, app, product, deferred, and UI files must not import the admin client directly.",
  futureModulePolicy:
    "Future modules, including Revenue Intelligence and outreach, must not import createAdminSupabaseClient directly."
} as const;
