import { z } from "zod";
import {
  ActiveOrganizationRequiredError,
  OrganizationAuthorizationError,
  assertCanUseShippedAction
} from "@/lib/auth";
import { CommercialAccessError } from "@/lib/billing/entitlements";
import { createBackgroundContractExportRequest } from "@/lib/contracts/background-exports";
import { assertContractExportPresetAccess } from "@/lib/contracts/export-access";
import {
  EXPORT_FORMATS,
  ExportPresetSelectionError,
  assertExportFormatSupported,
  resolveExportPreset,
  type ExportFormat
} from "@/lib/contracts/export";
import {
  createRouteHandler,
  parseJsonBodyWithSchema,
  requireOrganizationRouteAuth,
  routeForbiddenError,
  routeUnauthorizedError,
  routeValidationError
} from "@/lib/http";
import {
  IntelligenceAuthorizationError,
  IntelligencePlanAccessError
} from "@/lib/intelligence/access";
import { SHIPPED_EXPORT_CLASSIFICATION } from "@/lib/product/action-matrix";

const backgroundExportSchema = z.object({
  preset: z.string().optional(),
  format: z.enum(EXPORT_FORMATS).default("csv")
});

function mapBackgroundExportError(error: unknown) {
  if (error instanceof ExportPresetSelectionError) {
    return routeValidationError(
      "Export preset is not available.",
      "ERR_EXPORT_PRESET_INVALID_001"
    );
  }
  if (error instanceof ActiveOrganizationRequiredError) {
    return routeUnauthorizedError();
  }
  if (
    error instanceof OrganizationAuthorizationError ||
    error instanceof IntelligenceAuthorizationError
  ) {
    return routeForbiddenError("Forbidden", "ERR_PERMISSION_DENIED_001");
  }
  if (error instanceof CommercialAccessError || error instanceof IntelligencePlanAccessError) {
    return routeForbiddenError(
      "Export preset is not available for this organization.",
      "ERR_EXPORT_ENTITLEMENT_DENIED_001"
    );
  }
  return null;
}

export const POST = createRouteHandler(
  {
    auth: requireOrganizationRouteAuth(),
    parse: ({ request }) =>
      parseJsonBodyWithSchema(request, backgroundExportSchema, {
        message: "Invalid background export request.",
        code: "ERR_EXPORT_BACKGROUND_REQUEST_INVALID_001"
      }),
    mapError: mapBackgroundExportError
  },
  async ({ auth, input, audit, json }) => {
    const preset = resolveExportPreset(input.preset);
    const format = input.format as ExportFormat;
    assertExportFormatSupported(preset, format);

    await assertCanUseShippedAction(auth, SHIPPED_EXPORT_CLASSIFICATION[format].action, {
      onDenied: async ({ context, reason, action }) => {
        if (!context?.user) return;
        await audit({
          organizationId: context.organizationId,
          actorUserId: context.user.id,
          action: "contracts.export_denied",
          entityType: "export",
          details: {
            export_preset: preset.id,
            format,
            denied_action: action,
            denied_reason: reason,
            source: "background_export_request"
          }
        });
      }
    });

    await assertContractExportPresetAccess({
      context: auth,
      preset,
      format,
      source: "background_export_request"
    });

    const queued = await createBackgroundContractExportRequest({
      context: auth,
      presetId: preset.id,
      format
    });

    return json(
      {
        id: queued.id,
        status: queued.status,
        preset: queued.preset,
        format: queued.format,
        requestedAt: queued.requestedAt,
        downloadAvailable: queued.downloadAvailable
      },
      { status: 202 }
    );
  }
);
