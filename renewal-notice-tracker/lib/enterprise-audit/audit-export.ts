import { createAuditLog } from "@/lib/audit";
import {
  getEnterpriseAuditEvents,
  type EnterpriseAuditQueryFilters
} from "@/lib/enterprise-audit/audit-queries";
import type { EnterpriseAuditEvent } from "@/lib/enterprise-audit/audit-event-model";
import type { InternalRole } from "@/lib/product/shipping-profile";

export type EnterpriseAuditExportFormat = "json" | "csv";

export type EnterpriseAuditExportInput = EnterpriseAuditQueryFilters & {
  actorUserId: string;
  internalRole: InternalRole;
  format: EnterpriseAuditExportFormat;
};

export type EnterpriseAuditExportResult = {
  format: EnterpriseAuditExportFormat;
  rowCount: number;
  content: string;
  auditEvent: {
    action: "enterprise_audit.exported";
    organizationId: string;
    actorUserId: string;
    details: {
      format: EnterpriseAuditExportFormat;
      row_count: number;
      trust_sensitive_only: boolean;
      security_sensitive_only: boolean;
      date_from: string | null;
      date_to: string | null;
    };
  };
};

const CSV_COLUMNS = [
  "id",
  "createdAt",
  "eventCategory",
  "severity",
  "eventType",
  "eventSource",
  "actorUserId",
  "contractId",
  "isTrustSensitive",
  "isSecuritySensitive",
  "summary",
  "metadata"
] as const;

function escapeCsvValue(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function serializeCsv(events: EnterpriseAuditEvent[]) {
  const rows = events.map((event) =>
    CSV_COLUMNS.map((column) => escapeCsvValue(event[column])).join(",")
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

export async function exportEnterpriseAuditEvents(
  input: EnterpriseAuditExportInput
): Promise<EnterpriseAuditExportResult> {
  if (input.internalRole !== "internal_admin" && input.internalRole !== "internal_support") {
    throw new Error("Enterprise audit export requires an internal admin or support role.");
  }

  const { events } = await getEnterpriseAuditEvents(input);
  const auditEvent = {
    action: "enterprise_audit.exported" as const,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    details: {
      format: input.format,
      row_count: events.length,
      trust_sensitive_only: Boolean(input.trustSensitiveOnly),
      security_sensitive_only: Boolean(input.securitySensitiveOnly),
      date_from: input.dateFrom ?? null,
      date_to: input.dateTo ?? null
    }
  };

  await createAuditLog(
    {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: auditEvent.action,
      entityType: "enterprise_audit_export",
      details: auditEvent.details
    },
    { mode: "best_effort" }
  );

  return {
    format: input.format,
    rowCount: events.length,
    content: input.format === "json" ? JSON.stringify(events, null, 2) : serializeCsv(events),
    auditEvent
  };
}
