import { NextResponse } from "next/server";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import {
  CommercialAccessError,
  enforceFeatureAccess,
  getCommercialRedirectCode
} from "@/lib/billing/entitlements";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import {
  assertExportFormatSupported,
  buildExportAuditDetails,
  ExportPresetSelectionError,
  resolveExportPreset,
  toCsv,
  toXlsxBuffer,
  type ExportFormat,
  type ExportPreset
} from "@/lib/contracts/export";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildExportRequestEvidence } from "@/lib/commercial/privacy-operations";
import { getAppConfig } from "@/lib/config";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";
import {
  assertCanAccessIntelligenceSurface,
  IntelligenceAuthorizationError,
  IntelligencePlanAccessError
} from "@/lib/intelligence/access";

function getPresetFromRequest(request?: Request) {
  if (!request) return resolveExportPreset(null);
  return resolveExportPreset(new URL(request.url).searchParams.get("preset"));
}

function buildCommercialRedirect(error: CommercialAccessError) {
  return NextResponse.redirect(
    `${getAppConfig().public.appUrl}/dashboard/contracts?commercial=${getCommercialRedirectCode(error.feature, error.access.reason)}`,
    { status: 303 }
  );
}

async function assertPresetAccess(input: {
  context: NonNullable<Awaited<ReturnType<typeof getActiveOrganizationContextOrNull>>>;
  preset: ExportPreset;
  format: ExportFormat;
}) {
  if (!input.preset.allowedRoles.includes(input.context.role)) {
    await createAuditLog({
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      action: "contracts.export_denied",
      entityType: "export",
      details: {
        export_preset: input.preset.id,
        format: input.format,
        denied_reason: "role_not_allowed",
        role: input.context.role
      }
    });
    throw new OrganizationAuthorizationError("export_contracts", input.context.role);
  }

  if (input.preset.requiredCommercialFeature) {
    await enforceFeatureAccess({
      organizationId: input.context.organizationId,
      actorUserId: input.context.user.id,
      feature: input.preset.requiredCommercialFeature,
      context: {
        format: input.format,
        export_preset: input.preset.id,
        source: "export_route"
      }
    });
  }

  if (input.preset.id === "intelligence_export") {
    await assertCanAccessIntelligenceSurface({
      context: input.context,
      surface: "risk_queue"
    });
  }
}

async function recordExportPersistence(input: {
  organizationId: string;
  actorUserId: string;
  preset: ExportPreset;
  format: ExportFormat;
  rowCount: number;
}) {
  const admin = createAdminSupabaseClient();
  const details = buildExportAuditDetails({
    preset: input.preset,
    format: input.format,
    rowCount: input.rowCount
  });

  await admin.from("exports").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    export_type: input.format
  });
  await admin.from("data_export_requests").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    export_scope: "contracts",
    format: input.format,
    status: "completed",
    completed_at: details.exported_at,
    evidence_json: {
      ...(buildExportRequestEvidence({
        format: input.format,
        rowCount: input.rowCount,
        source: "export_route"
      }) as Record<string, unknown>),
      ...details
    }
  });
}

export async function handleContractsExport(
  format: ExportFormat,
  request?: Request
) {
  let preset: ExportPreset;
  try {
    preset = getPresetFromRequest(request);
    assertExportFormatSupported(preset, format);
  } catch (error) {
    if (error instanceof ExportPresetSelectionError) {
      return NextResponse.json(
        { error: "Export preset is not available." },
        { status: 400 }
      );
    }
    throw error;
  }

  const auth = await getActiveOrganizationContextOrNull();
  let context;
  try {
    context = await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION[format].action, {
      onDenied: async ({ context: deniedContext, reason, action }) => {
        if (!deniedContext?.user) return;
        await createAuditLog({
          organizationId: deniedContext.organizationId,
          actorUserId: deniedContext.user.id,
          action: "contracts.export_denied",
          entityType: "export",
          details: {
            export_preset: preset.id,
            format,
            denied_action: action,
            denied_reason: reason
          }
        });
      }
    });
    await assertPresetAccess({ context, preset, format });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof OrganizationAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof IntelligenceAuthorizationError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof IntelligencePlanAccessError) {
      return NextResponse.redirect(
        `${getAppConfig().public.appUrl}/dashboard/contracts?commercial=${getCommercialRedirectCode(error.feature, error.access.reason)}`,
        { status: 303 }
      );
    }
    if (error instanceof CommercialAccessError) {
      return buildCommercialRedirect(error);
    }
    throw error;
  }

  const { user, organizationId } = context;
  const attemptedDetails = buildExportAuditDetails({ preset, format, rowCount: 0 });
  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.export_attempted",
    entityType: "export",
    details: attemptedDetails
  });

  const rows = await getExportRows(organizationId, preset.id);
  const completedDetails = buildExportAuditDetails({
    preset,
    format,
    rowCount: rows.length
  });

  await recordExportPersistence({
    organizationId,
    actorUserId: user.id,
    preset,
    format,
    rowCount: rows.length
  });

  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "contracts.exported",
    entityType: "export",
    details: completedDetails
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "export_requested",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `export_requested:${format}:${preset.id}:${organizationId}:${rows.length}`,
    properties: completedDetails
  });

  if (format === "csv") {
    return new NextResponse(toCsv(rows, preset.columns), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contracts-${preset.id}.csv"`
      }
    });
  }

  return new NextResponse(toXlsxBuffer(rows, preset.columns), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="contracts-${preset.id}.xlsx"`
    }
  });
}
