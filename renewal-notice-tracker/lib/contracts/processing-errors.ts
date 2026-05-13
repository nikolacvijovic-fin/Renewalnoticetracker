import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export async function recordProcessingError(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminSupabaseClient();
  await admin.from("processing_errors").insert({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    contract_file_id: input.contractFileId ?? null,
    stage: input.stage,
    error_message: input.message,
    details: (input.details ?? {}) as Json
  });
}
