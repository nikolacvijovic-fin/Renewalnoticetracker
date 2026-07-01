import { createAuditLog } from "@/lib/audit";
import type { ActiveOrganizationContext } from "@/lib/auth";
import { OrganizationAuthorizationError } from "@/lib/auth";
import { enforceFeatureAccess, getBillingSnapshot } from "@/lib/billing/entitlements";
import type { ExportFormat, ExportPreset } from "@/lib/contracts/export";
import { assertCanAccessIntelligenceSurface } from "@/lib/intelligence/access";
import {
  assertPlatformCapabilityGate,
  type PlatformRuntimeContextResolverInput
} from "@/lib/product/platform-capability-gates";
import type { PlatformRuntimeContext } from "@/lib/product/platform-orchestration";

export async function assertContractExportPresetAccess(input: {
  context: ActiveOrganizationContext;
  preset: ExportPreset;
  format: ExportFormat;
  source: "export_route" | "background_export_request";
  platformRuntimeContextInput?: Omit<PlatformRuntimeContextResolverInput, "context" | "billingSnapshot">;
  platformRuntimeContextOverrides?: Partial<PlatformRuntimeContext>;
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

  const commercialResult = input.preset.requiredCommercialFeature
    ? await enforceFeatureAccess({
        organizationId: input.context.organizationId,
        actorUserId: input.context.user.id,
        feature: input.preset.requiredCommercialFeature,
        context: {
          format: input.format,
          export_preset: input.preset.id,
          source: input.source
        }
      })
    : {
        billingSnapshot: await getBillingSnapshot(input.context.organizationId),
        accessResult: undefined
      };

  assertPlatformCapabilityGate({
    capabilityId: "exports",
    context: input.context,
    billingSnapshot: commercialResult.billingSnapshot,
    billingDecision: commercialResult.accessResult,
    permissionDecision: {
      allowed: true
    },
    runtimeContextInput: input.platformRuntimeContextInput,
    runtimeContextOverrides: input.platformRuntimeContextOverrides
  });

  if (input.preset.id === "intelligence_export") {
    await assertCanAccessIntelligenceSurface({
      context: input.context,
      surface: "risk_queue"
    });
  }
}
