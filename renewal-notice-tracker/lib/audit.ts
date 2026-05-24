import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export class AuditLogWriteError extends Error {
  constructor(
    message: string,
    public readonly input: {
      organizationId: string;
      actorUserId?: string | null;
      contractId?: string | null;
      action: string;
      entityType: string;
      entityId?: string | null;
      details?: Record<string, unknown>;
    },
    public readonly cause: unknown
  ) {
    super(message);
    this.name = "AuditLogWriteError";
  }
}

type AuditLogInput = {
  organizationId: string;
  actorUserId?: string | null;
  contractId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown>;
};

type CriticalAuditResult = {
  ok: true;
};

type BestEffortAuditResult =
  | { ok: true }
  | { ok: false; error: AuditLogWriteError };

type AuditLogOptions =
  | { mode?: "critical" }
  | { mode: "best_effort" };

export async function createAuditLog(
  input: AuditLogInput,
  options?: { mode?: "critical" }
): Promise<CriticalAuditResult>;
export async function createAuditLog(
  input: AuditLogInput,
  options: { mode: "best_effort" }
): Promise<BestEffortAuditResult>;
export async function createAuditLog(input: AuditLogInput, options: AuditLogOptions = {}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId ?? null,
    contract_id: input.contractId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? input.contractId ?? null,
    details: (input.details ?? {}) as Json
  });

  if (!error) {
    return { ok: true } as const;
  }

  const auditError = new AuditLogWriteError(
    `Audit log write failed for action "${input.action}".`,
    input,
    error
  );

  if (options.mode === "best_effort") {
    return {
      ok: false,
      error: auditError
    } as const;
  }

  throw auditError;
}
