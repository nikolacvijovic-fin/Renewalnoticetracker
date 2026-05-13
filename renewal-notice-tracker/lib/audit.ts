import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export async function createAuditLog(input: {
  organizationId: string;
  actorUserId?: string | null;
  contractId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
}) {
  const admin = createAdminSupabaseClient();
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId ?? null,
    contract_id: input.contractId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? input.contractId ?? null,
    details: (input.details ?? {}) as Json
  });
}
