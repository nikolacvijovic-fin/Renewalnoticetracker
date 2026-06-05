import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction,
  getActiveOrganizationContextOrNull
} from "@/lib/auth";
import {
  CommercialAccessError,
  getCommercialRedirectCode
} from "@/lib/billing/entitlements";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getExportRows } from "@/lib/contracts/kernel-queries";
import {
  assertExportFormatSupported,
  assertExportGenerationPreflight,
  buildExportAuditDetails,
  ExportGenerationPreflightError,
  ExportPresetSelectionError,
  ExportScaleLimitError,
  resolveExportPreset,
  sanitizeExportOperationalError,
  serializeExportArtifact,
  type ExportFormat,
  type ExportPreset
} from "@/lib/contracts/export";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { buildExportRequestEvidence } from "@/lib/commercial/privacy-operations";
import { getAppConfig } from "@/lib/config";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";
import {
  IntelligenceAuthorizationError,
  IntelligencePlanAccessError
} from "@/lib/intelligence/access";
import {
  logServerError,
  logServerWarn
} from "@/lib/observability/server-logger";
import { emitOperationalEvent } from "@/lib/observability/monitoring";
import { ROUTE_REQUEST_ID_HEADER } from "@/lib/http";
import { assertContractExportPresetAccess } from "@/lib/contracts/export-access";

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

function getExportRouteRequestId(request?: Request) {
  return request?.headers.get(ROUTE_REQUEST_ID_HEADER)?.trim() || randomUUID();
}

function withExportRequestId(response: NextResponse, requestId: string) {
  if (!response.headers.get(ROUTE_REQUEST_ID_HEADER)) {
    response.headers.set(ROUTE_REQUEST_ID_HEADER, requestId);
  }
  return response;
}

function getExportRoutePath(request?: Request) {
  return request ? new URL(request.url).pathname : "/dashboard/contracts/export";
}

function logExportDenied(input: {
  request?: Request;
  requestId: string;
  preset: ExportPreset;
  format: ExportFormat;
  context?: NonNullable<Awaited<ReturnType<typeof getActiveOrganizationContextOrNull>>> | null;
  reason: string;
}) {
  logServerWarn({
    event: "export_denied",
    route: getExportRoutePath(input.request),
    organizationId: input.context?.organizationId ?? null,
    actorUserId: input.context?.user?.id ?? null,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      denied_reason: input.reason
    }
  });
  void emitOperationalEvent({
    eventName: "export_sync_rejected",
    severity: "P3",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: false,
    route: getExportRoutePath(input.request),
    organizationId: input.context?.organizationId ?? null,
    actorUserId: input.context?.user?.id ?? null,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      denied_reason: input.reason
    }
  });
}

function logExportFailed(input: {
  request?: Request;
  requestId: string;
  preset: ExportPreset;
  format: ExportFormat;
  organizationId: string;
  actorUserId: string;
  error: unknown;
}) {
  const safeError = sanitizeExportOperationalError(input.error);
  logServerError({
    event: "export_failed",
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format
    },
    error: safeError
  });
  void emitOperationalEvent({
    eventName: "export_failed",
    severity: "P2",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: true,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    },
    error: safeError
  });
  void emitOperationalEvent({
    eventName: "export_sync_failed",
    severity: "P2",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: true,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    },
    error: safeError
  });
}

function logExportTooLarge(input: {
  request?: Request;
  requestId: string;
  preset: ExportPreset;
  format: ExportFormat;
  organizationId: string;
  actorUserId: string;
  error: ExportScaleLimitError;
}) {
  logServerWarn({
    event: "export_too_large",
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      row_count: input.error.input.rowCount,
      max_rows: input.error.input.maxRows
    }
  });
  void emitOperationalEvent({
    eventName: "export_too_large",
    severity: "P3",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: false,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      row_count: input.error.input.rowCount,
      max_rows: input.error.input.maxRows,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    }
  });
  void emitOperationalEvent({
    eventName: "export_sync_rejected",
    severity: "P3",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: false,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      rejected_reason: "sync_row_limit",
      row_count: input.error.input.rowCount,
      max_rows: input.error.input.maxRows,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    }
  });
}

function logExportPreflightRejected(input: {
  request?: Request;
  requestId: string;
  preset: ExportPreset;
  format: ExportFormat;
  organizationId: string;
  actorUserId: string;
  error: ExportGenerationPreflightError;
}) {
  logServerWarn({
    event: "export_preflight_rejected",
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      row_count: input.error.input.rowCount,
      complexity_score: input.error.input.complexityScore,
      max_complexity_score: input.error.input.maxComplexityScore,
      max_text_heavy_rows: input.error.input.maxTextHeavyRows,
      reason: input.error.input.reason,
      recommendation: input.error.input.recommendation
    }
  });
  void emitOperationalEvent({
    eventName: "export_preflight_rejected",
    severity: "P3",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: false,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      row_count: input.error.input.rowCount,
      complexity_score: input.error.input.complexityScore,
      max_complexity_score: input.error.input.maxComplexityScore,
      max_text_heavy_rows: input.error.input.maxTextHeavyRows,
      reason: input.error.input.reason,
      recommendation: input.error.input.recommendation,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    }
  });
  void emitOperationalEvent({
    eventName: "export_sync_rejected",
    severity: "P3",
    sensitivity: input.preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
    alert: false,
    route: getExportRoutePath(input.request),
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    metadata: {
      export_preset: input.preset.id,
      format: input.format,
      rejected_reason: input.error.input.reason,
      row_count: input.error.input.rowCount,
      max_complexity_score: input.error.input.maxComplexityScore,
      max_text_heavy_rows: input.error.input.maxTextHeavyRows,
      sensitive_sections_included: input.preset.sensitiveSectionsIncluded
    }
  });
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
  const requestId = getExportRouteRequestId(request);
  let preset: ExportPreset;
  try {
    preset = getPresetFromRequest(request);
    assertExportFormatSupported(preset, format);
  } catch (error) {
    if (error instanceof ExportPresetSelectionError) {
      return withExportRequestId(NextResponse.json(
        { error: "Export preset is not available." },
        { status: 400 }
      ), requestId);
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
    await assertContractExportPresetAccess({
      context,
      preset,
      format,
      source: "export_route"
    });
  } catch (error) {
    if (error instanceof ActiveOrganizationRequiredError) {
      logExportDenied({ request, requestId, preset, format, reason: "unauthorized" });
      return withExportRequestId(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        requestId
      );
    }
    if (error instanceof OrganizationAuthorizationError) {
      logExportDenied({ request, requestId, preset, format, context: auth, reason: "forbidden" });
      return withExportRequestId(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        requestId
      );
    }
    if (error instanceof IntelligenceAuthorizationError) {
      logExportDenied({
        request,
        requestId,
        preset,
        format,
        context: auth,
        reason: "intelligence_forbidden"
      });
      return withExportRequestId(
        NextResponse.json({ error: "Forbidden" }, { status: 403 }),
        requestId
      );
    }
    if (error instanceof IntelligencePlanAccessError) {
      logExportDenied({
        request,
        requestId,
        preset,
        format,
        context: auth,
        reason: error.access.reason
      });
      return withExportRequestId(
        NextResponse.redirect(
          `${getAppConfig().public.appUrl}/dashboard/contracts?commercial=${getCommercialRedirectCode(error.feature, error.access.reason)}`,
          { status: 303 }
        ),
        requestId
      );
    }
    if (error instanceof CommercialAccessError) {
      logExportDenied({
        request,
        requestId,
        preset,
        format,
        context: auth,
        reason: error.access.reason
      });
      return withExportRequestId(buildCommercialRedirect(error), requestId);
    }
    throw error;
  }

  const { user, organizationId } = context;
  try {
    const attemptedDetails = buildExportAuditDetails({ preset, format, rowCount: 0 });
    await createAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "contracts.export_attempted",
      entityType: "export",
      details: attemptedDetails
    });
    void emitOperationalEvent({
      eventName: "export_sync_attempted",
      severity: "P3",
      sensitivity: preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
      alert: false,
      route: getExportRoutePath(request),
      organizationId,
      actorUserId: user.id,
      requestId,
      metadata: {
        export_preset: preset.id,
        format,
        sensitive_sections_included: preset.sensitiveSectionsIncluded
      }
    });

    const rows = await getExportRows(organizationId, preset.id);
    assertExportGenerationPreflight({
      preset,
      format,
      rows
    });
    const artifact = serializeExportArtifact({
      preset,
      format,
      rows
    });
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
    void emitOperationalEvent({
      eventName: "export_sync_completed",
      severity: "P3",
      sensitivity: preset.sensitiveSectionsIncluded ? "customer_sensitive" : "internal",
      alert: false,
      route: getExportRoutePath(request),
      organizationId,
      actorUserId: user.id,
      requestId,
      metadata: {
        export_preset: preset.id,
        format,
        row_count: rows.length,
        included_sections: preset.includedSections,
        sensitive_sections_included: preset.sensitiveSectionsIncluded
      }
    });

    if (format === "csv") {
      return withExportRequestId(
        new NextResponse(artifact, {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="contracts-${preset.id}.csv"`
          }
        }),
        requestId
      );
    }

    return withExportRequestId(
      new NextResponse(artifact, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="contracts-${preset.id}.xlsx"`
        }
      }),
      requestId
    );
  } catch (error) {
    if (error instanceof ExportScaleLimitError) {
      logExportTooLarge({
        request,
        requestId,
        preset,
        format,
        organizationId,
        actorUserId: user.id,
        error
      });
      return withExportRequestId(
        NextResponse.json(
          {
            error: "Export is too large for synchronous download. Create a background export request instead.",
            code: "ERR_EXPORT_BACKGROUND_REQUIRED_001",
            requestId,
            maxRows: error.input.maxRows,
            backgroundExport: {
              method: "POST",
              path: "/api/exports/contracts",
              preset: preset.id,
              format
            }
          },
          { status: 413 }
        ),
        requestId
      );
    }

    if (error instanceof ExportGenerationPreflightError) {
      logExportPreflightRejected({
        request,
        requestId,
        preset,
        format,
        organizationId,
        actorUserId: user.id,
        error
      });
      return withExportRequestId(
        NextResponse.json(
          {
            error: "Export is too large for safe XLSX generation. Use CSV or reduce the export scope.",
            code: "ERR_EXPORT_XLSX_TOO_LARGE_001",
            requestId,
            rowCount: error.input.rowCount,
            recommendation: "csv_or_smaller_export"
          },
          { status: 413 }
        ),
        requestId
      );
    }

    logExportFailed({
      request,
      requestId,
      preset,
      format,
      organizationId,
      actorUserId: user.id,
      error
    });
    return withExportRequestId(
      NextResponse.json(
        {
          error: "Export could not be completed.",
          code: "ERR_EXPORT_FAILED_001",
          requestId
        },
        { status: 500 }
      ),
      requestId
    );
  }
}
