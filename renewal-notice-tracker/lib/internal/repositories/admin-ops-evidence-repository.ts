import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { checkedPrivilegedWrite } from "@/lib/supabase/checked-write";
import type { Json } from "@/lib/supabase/database.types";

export type BackupReadinessCheckInsert = {
  environment: string;
  status: string;
  summary?: string | null;
  restoreTestedAt?: string | null;
  evidence: Json;
  context: "internal_backup_readiness" | "internal_restore_drill";
};

export async function insertBackupReadinessCheck(input: BackupReadinessCheckInsert) {
  const admin = createAdminSupabaseClient();
  await checkedPrivilegedWrite(
    admin.from("backup_readiness_checks").insert({
      environment: input.environment,
      status: input.status,
      summary: input.summary ?? null,
      restore_tested_at: input.restoreTestedAt ?? null,
      evidence_json: input.evidence
    }),
    {
      operation: "insert",
      table: "backup_readiness_checks",
      context: input.context
    }
  );
}
