import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildCustomerExportJson,
  buildCustomerExportWorkbookBuffer,
  buildLeadershipSummaryPdfBuffer,
  type AuditSafeHistoryInput,
  type CustomerExportBundleInput
} from "@/lib/exports/customer-export-center";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";

type CustomerExportDownloadFormat = "json" | "pdf" | "xlsx";
const AUDIT_HISTORY_EXPORT_LIMIT = 250;

function assertFullCustomerExportRole(role: string) {
  if (role !== "admin" && role !== "operator") {
    throw new OrganizationAuthorizationError("export_contracts", role);
  }
}

function buildExportAuditDetails(input: {
  exportType: "customer_data_export" | "leadership_summary";
  format: CustomerExportDownloadFormat;
  rowCounts: Record<string, number>;
}) {
  return {
    export_type: input.exportType,
    format: input.format,
    row_counts: input.rowCounts,
    date_range: "all_available",
    sensitive_sections_included: false,
    generated_at: new Date().toISOString()
  };
}

async function loadCustomerExportBundle(input: { organizationId: string }): Promise<CustomerExportBundleInput> {
  const generatedAt = new Date().toISOString();
  const [renewalRows, auditHistory] = await Promise.all([
    getExportRows(input.organizationId, "basic_contract_register"),
    loadAuditSafeHistory(input.organizationId)
  ]);

  return {
    organizationId: input.organizationId,
    generatedAt,
    renewalRows,
    auditHistory
  };
}

async function loadAuditSafeHistory(organizationId: string): Promise<AuditSafeHistoryInput[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("actor_user_id, entity_type, entity_id, action, details, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(AUDIT_HISTORY_EXPORT_LIMIT);

  if (error) throw error;

  return ((data ?? []) as unknown as Array<{
    actor_user_id: string | null;
    entity_type: string;
    entity_id: string | null;
    action: string;
    details: Record<string, unknown> | null;
    created_at: string;
  }>).map((row) => ({
    timestamp: row.created_at,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    metadata: row.details
  }));
}

async function recordCustomerExportCreated(input: {
  organizationId: string;
  actorUserId: string;
  exportType: "customer_data_export" | "leadership_summary";
  format: CustomerExportDownloadFormat;
  rowCounts: Record<string, number>;
}) {
  const details = buildExportAuditDetails(input);
  await createAuditLog({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "export.created",
    entityType: "export",
    details
  });
  await trackServerAnalyticsEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:${input.exportType}:${input.format}:${input.organizationId}:${input.rowCounts.renewalDeadlineRegister ?? 0}`,
    properties: details
  });
}

export async function handleCustomerDataExport(format: CustomerExportDownloadFormat) {
  const auth = await getActiveOrganizationContextOrNull();
  let context;

  try {
    context = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION.csv.action, {
      organizationId: auth?.organizationId ?? null,
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "export.failed",
          entityType: "export",
          details: {
            export_type: format === "pdf" ? "leadership_summary" : "customer_data_export",
            format,
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
    assertFullCustomerExportRole(context.role);
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }

  try {
    const bundle = await loadCustomerExportBundle({ organizationId: context.organizationId });
    const json = buildCustomerExportJson(bundle);
    const rowCounts = {
      renewalDeadlineRegister: json.datasets.renewalDeadlineRegister.length,
      urgentDeadlines: json.datasets.urgentDeadlines.length,
      ownerActionList: json.datasets.ownerActionList.length,
      renewalDecisions: json.datasets.renewalDecisions.length,
      riskFindings: json.datasets.riskFindings.length,
      auditSafeHistory: json.datasets.auditSafeHistory.length
    };

    const artifact =
      format === "json"
        ? json
        : format === "xlsx"
          ? buildCustomerExportWorkbookBuffer(bundle)
          : buildLeadershipSummaryPdfBuffer(bundle);

    await recordCustomerExportCreated({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      exportType: format === "pdf" ? "leadership_summary" : "customer_data_export",
      format,
      rowCounts
    });

    if (format === "json") {
      return NextResponse.json(artifact, {
        headers: {
          "Content-Disposition": 'attachment; filename="noticecontrol-customer-data-export.json"'
        }
      });
    }

    if (format === "xlsx") {
      return new NextResponse(new Uint8Array(artifact as Buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="noticecontrol-customer-data-export.xlsx"'
        }
      });
    }

    return new NextResponse(new Uint8Array(artifact as Buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="noticecontrol-leadership-summary.pdf"'
      }
    });
  } catch {
    await createAuditLog({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      action: "export.failed",
      entityType: "export",
      details: {
        export_type: format === "pdf" ? "leadership_summary" : "customer_data_export",
        format,
        failure_code: "customer_export_failed"
      }
    });
    return NextResponse.json({ error: "Export could not be completed." }, { status: 500 });
  }
}
