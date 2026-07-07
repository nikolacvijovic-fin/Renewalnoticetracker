import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export type AdminProcessingErrorInsert = {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  stage: string;
  message: string;
  details?: Record<string, unknown>;
};

export async function insertContractProcessingError(input: AdminProcessingErrorInsert) {
  const admin = createAdminSupabaseClient();
  return admin.from("processing_errors").insert({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    contract_file_id: input.contractFileId ?? null,
    stage: input.stage,
    error_message: input.message,
    details: (input.details ?? {}) as Json
  });
}
