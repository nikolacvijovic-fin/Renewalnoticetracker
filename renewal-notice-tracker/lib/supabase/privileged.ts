import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type PrivilegedSupabasePurpose =
  | "audit_write"
  | "analytics_write"
  | "billing_control_plane"
  | "contract_action_legacy"
  | "contract_export"
  | "internal_operations"
  | "ocr_job"
  | "reminder_control_plane"
  | "workspace_deletion";

export function createPrivilegedSupabaseClient(_purpose: PrivilegedSupabasePurpose) {
  void _purpose;
  return createAdminSupabaseClient();
}
