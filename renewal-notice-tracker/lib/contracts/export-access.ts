import { createAuditLog } from "@/lib/audit";
import type { ActiveOrganizationContext } from "@/lib/auth";
import { OrganizationAuthorizationError } from "@/lib/auth";
import { enforceFeatureAccess } from "@/lib/billing/entitlements";
import type { ExportFormat, ExportPreset } from "@/lib/contracts/export";
import { assertCanAccessIntelligenceSurface } from "@/lib/intelligence/access";

export async function assertContractExportPresetAccess(input: {
  context: ActiveOrganizationContext;
  preset: ExportPreset;
  format: ExportFormat;
  source: "export_route" | "background_export_request";
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
        role: input.context.role,
        source: input.source
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
        source: input.source
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
