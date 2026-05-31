import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import { toCsv } from "@/lib/contracts/export";
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
    context = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION.csv.action, {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "contracts.export_denied",
          entityType: "export",
          details: {
            format: "csv",
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
    details: { format: "csv" }
  });
  try {
    await enforceFeatureAccess({
      organizationId,
      actorUserId: user.id,
      feature: "exports",
      context: { format: "csv", source: "export_route" }
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
  const csv = toCsv(rows);

  const admin = createAdminSupabaseClient();
  await admin.from("exports").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    export_type: "csv"
  });
  await admin.from("data_export_requests").insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    export_scope: "contracts",
    format: "csv",
    status: "completed",
    completed_at: new Date().toISOString(),
    evidence_json: buildExportRequestEvidence({
      format: "csv",
      rowCount: rows.length,
      source: "export_route"
    })
  });

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.exported",
    entityType: "export",
    details: { format: "csv", row_count: rows.length }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:csv:${organizationId}:${rows.length}`,
    properties: {
      format: "csv",
      row_count: rows.length
    }
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="contracts.csv"'
    }
  });
}
