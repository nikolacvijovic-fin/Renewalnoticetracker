import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import { toXlsxBuffer } from "@/lib/contracts/export";
import { createAuditLog } from "@/lib/audit";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildExportRequestEvidence } from "@/lib/commercial/privacy-operations";
import {
  CommercialAccessError,
  enforceFeatureAccess,
  getCommercialRedirectCode
} from "@/lib/billing/entitlements";
import { getAppConfig } from "@/lib/config";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";

export async function GET() {
  const auth = await getActiveOrganizationContextOrNull();
  let context;
  try {
    context = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION.xlsx.action, {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "contracts.export_denied",
          entityType: "export",
          details: {
            format: "xlsx",
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw error;
  }
  const { user, organizationId } = context;
  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.export_attempted",
    entityType: "export",
    details: { format: "xlsx" }
  });
  try {
    await enforceFeatureAccess({
      organizationId,
      actorUserId: user.id,
      feature: "exports",
      context: { format: "xlsx", source: "export_route" }
    });
  } catch (error) {
    if (error instanceof CommercialAccessError) {
      return NextResponse.redirect(
        `${getAppConfig().public.appUrl}/dashboard/contracts?commercial=${getCommercialRedirectCode(error.feature, error.access.reason)}`,
        { status: 303 }
      );
    }
    throw error;
  }
  const rows = await getExportRows(organizationId);
  const buffer = toXlsxBuffer(rows);

  const admin = createAdminSupabaseClient();
  await admin.from("exports").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    export_type: "xlsx"
  });
  await admin.from("data_export_requests").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    export_scope: "contracts",
    format: "xlsx",
    status: "completed",
    completed_at: new Date().toISOString(),
    evidence_json: buildExportRequestEvidence({
      format: "xlsx",
      rowCount: rows.length,
      source: "export_route"
    })
  });

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.exported",
    entityType: "export",
    details: { format: "xlsx", row_count: rows.length }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:xlsx:${organizationId}:${rows.length}`,
    properties: {
      format: "xlsx",
      row_count: rows.length
    }
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="contracts.xlsx"'
    }
  });
}
