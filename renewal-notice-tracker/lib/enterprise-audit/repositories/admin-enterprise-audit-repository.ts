import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { EnterpriseAuditEventSource } from "@/lib/enterprise-audit/audit-event-model";

export type AdminEnterpriseAuditEventInsert = {
  source: EnterpriseAuditEventSource;
  organizationId: string;
  contractId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  eventSource: string;
  metadata?: Record<string, Json>;
};

export async function insertEnterpriseAuditEvent(input: AdminEnterpriseAuditEventInsert) {
  const admin = createAdminSupabaseClient();
  const payload = {
    organization_id: input.organizationId,
    contract_id: input.contractId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    event_source: input.eventSource,
    metadata: input.metadata ?? {}
  };

  if (input.source === "audit_logs") {
    const auditLogPayload: Database["public"]["Tables"]["audit_logs"]["Insert"] = {
      organization_id: input.organizationId,
      contract_id: input.contractId ?? null,
      actor_user_id: input.actorUserId ?? null,
      action: input.eventType,
      entity_type:
        typeof input.metadata?.entity_type === "string"
          ? input.metadata.entity_type
          : "enterprise_audit",
      entity_id:
        typeof input.metadata?.entity_id === "string"
          ? input.metadata.entity_id
          : input.contractId ?? null,
      details: input.metadata ?? {}
    };
    return admin.from("audit_logs").insert(auditLogPayload);
  }

  return (admin as unknown as { from(table: string): { insert(payload: unknown): Promise<{ error: Error | null }> } })
    .from(input.source)
    .insert(payload);
}
