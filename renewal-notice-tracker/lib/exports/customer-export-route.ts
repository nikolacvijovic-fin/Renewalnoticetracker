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
import {
  buildCustomerExportJson,
  buildLeadershipSummaryPdfBuffer,
  type CustomerExportBundleInput
} from "@/lib/exports/customer-export-center";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";

type CustomerExportDownloadFormat = "json" | "pdf";

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
  const renewalRows = await getExportRows(input.organizationId, "basic_contract_register");

  return {
    organizationId: input.organizationId,
    generatedAt,
    renewalRows,
    auditHistory: []
  };
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
            export_type: format === "json" ? "customer_data_export" : "leadership_summary",
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
      auditSafeHistory: json.datasets.auditSafeHistory.length
    };

    await recordCustomerExportCreated({
      organizationId: context.organizationId,
      actorUserId: context.user.id,
      exportType: format === "json" ? "customer_data_export" : "leadership_summary",
      format,
      rowCounts
    });

    if (format === "json") {
      return NextResponse.json(json, {
        headers: {
          "Content-Disposition": 'attachment; filename="noticecontrol-customer-data-export.json"'
        }
      });
    }

    return new NextResponse(buildLeadershipSummaryPdfBuffer(bundle), {
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
        export_type: format === "json" ? "customer_data_export" : "leadership_summary",
        format,
        failure_code: "customer_export_failed"
      }
    });
    return NextResponse.json({ error: "Export could not be completed." }, { status: 500 });
  }
}
