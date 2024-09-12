import {
  redactEnterpriseAuditMetadata,
  type EnterpriseAuditEventCategory,
  type EnterpriseAuditEventSource,
  type EnterpriseAuditSeverity
} from "@/lib/enterprise-audit/audit-event-model";
import { insertEnterpriseAuditEvent } from "@/lib/enterprise-audit/repositories/admin-enterprise-audit-repository";
import type { Json } from "@/lib/supabase/database.types";

export type EnterpriseAuditRecorderMode = "strict" | "best_effort";

export type RecordEnterpriseAuditEventInput = {
  organizationId: string;
  contractId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  eventCategory: EnterpriseAuditEventCategory;
  eventSource: string;
  severity: EnterpriseAuditSeverity;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
  mode?: EnterpriseAuditRecorderMode;
};

export type RecordEnterpriseAuditEventResult =
  | { ok: true; source: EnterpriseAuditEventSource }
  | { ok: false; source: EnterpriseAuditEventSource; error: Error };

export class EnterpriseAuditRecorderError extends Error {
  constructor(
    message: string,
    public readonly input: Omit<RecordEnterpriseAuditEventInput, "metadata">,
    public readonly cause: unknown
  ) {
    super(message);
    this.name = "EnterpriseAuditRecorderError";
  }
}

export function resolveEnterpriseAuditEventTable(
  input: Pick<RecordEnterpriseAuditEventInput, "eventCategory" | "eventSource">
): EnterpriseAuditEventSource {
  const source = input.eventSource.toLowerCase();
  if (source.includes("trusted_reminder") || input.eventCategory === "trusted_reminder") {
    return "trusted_reminder_gate_events";
  }
  if (source.includes("trust_exception") || input.eventCategory === "trust_exception") {
    return "trust_exception_approval_events";
  }
  if (source.includes("renewal_decision") || input.eventCategory === "renewal_decision") {
    return "renewal_decision_events";
  }
  if (source.includes("activation")) {
    return "organization_activation_events";
  }
  if (input.eventCategory === "auth" || input.eventCategory === "billing" || input.eventCategory === "admin") {
    return "audit_logs";
  }
  return "contract_audit_events";
}

export async function recordEnterpriseAuditEvent(
  input: RecordEnterpriseAuditEventInput
): Promise<RecordEnterpriseAuditEventResult> {
  const organizationId = input.organizationId.trim();
  if (!organizationId) {
    throw new EnterpriseAuditRecorderError(
      "Enterprise audit events require an organization id.",
      { ...input, metadata: undefined } as never,
      null
    );
  }

  const source = resolveEnterpriseAuditEventTable(input);
  const metadata = redactEnterpriseAuditMetadata({
    ...(input.metadata ?? {}),
    event_category: input.eventCategory,
    severity: input.severity,
    idempotency_key: input.idempotencyKey ?? undefined
  }) as Record<string, Json>;

  let error: unknown = null;
  try {
    const result = await insertEnterpriseAuditEvent({
      source,
      organizationId,
      contractId: input.contractId ?? null,
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      eventSource: input.eventSource,
      metadata
    });
    error = result.error;
  } catch (caught) {
    error = caught;
  }

  if (!error) {
    return { ok: true, source };
  }

  const recorderError = new EnterpriseAuditRecorderError(
    `Enterprise audit event write failed for "${input.eventType}".`,
    { ...input, metadata: undefined } as never,
    error
  );

  if (input.mode === "best_effort") {
    return { ok: false, source, error: recorderError };
  }

  throw recorderError;
}
