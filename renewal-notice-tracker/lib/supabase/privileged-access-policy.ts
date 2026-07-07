export const APPROVED_DIRECT_ADMIN_SUPABASE_IMPORTERS = [
  "app/api/internal/backup-readiness/route.ts",
  "app/api/internal/restore-drill/route.ts",
  "lib/actions/contracts/legacy.ts",
  "lib/analytics/events.ts",
  "lib/audit.ts",
  "lib/billing/service.ts",
  "lib/commercial/capacity-snapshot.ts",
  "lib/commercial/readiness-snapshot.ts",
  "lib/contracts/background-exports.ts",
  "lib/contracts/export-route.ts",
  "lib/contracts/processing-errors.ts",
  "lib/contracts/queries.ts",
  "lib/email/actions.ts",
  "lib/notifications/reminders.ts",
  "lib/ocr/jobs.ts",
  "lib/organization/scoped-admin.ts",
  "lib/organization/workspace-deletion.ts",
  "lib/supabase/privileged.ts"
] as const;

export const PRIVILEGED_ACCESS_POLICY = {
  canonicalWrapper: "lib/supabase/privileged.ts",
  directImportPolicy:
    "Existing direct service-role imports are allowlisted for compatibility. New privileged code must use a scoped repository or createPrivilegedSupabaseClient with an explicit purpose.",
  futureModulePolicy:
    "Future modules, including Revenue Intelligence and outreach, must not import createAdminSupabaseClient directly."
} as const;
