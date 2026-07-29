import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_MODULES,
  PLATFORM_MODULE_IDS,
  type PlatformModule
} from "@/lib/product/platform-modules";
import { DEFERRED_CAPABILITY_SLUGS } from "@/lib/product/deferred-capabilities";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

function hasOwnerSurface(module: PlatformModule) {
  return (
    module.ownerSurfaces.routes.length > 0 ||
    module.ownerSurfaces.components.length > 0 ||
    module.ownerSurfaces.modules.length > 0 ||
    module.ownerSurfaces.docs.length > 0
  );
}

describe("platform module registry", () => {
  it("defines the expected platform modules and add-ons in one registry", () => {
    expect(new Set(PLATFORM_MODULE_IDS).size).toBe(PLATFORM_MODULE_IDS.length);

    for (const required of [
      "core_renewal_control_kernel",
      "contract_intelligence_risk_explanation",
      "financial_exposure_intelligence",
      "procurement_vendor_analytics",
      "export_reporting_intelligence",
      "ocr_import_intelligence",
      "reminder_workflow_automation",
      "billing_entitlement_control",
      "admin_support_operations",
      "revenue_intelligence_command_center",
      "enterprise_identity_rbac_retention",
      "enterprise_integrations",
      "advanced_retention_governance_analytics",
      "full_clm_expansion"
    ]) {
      expect(PLATFORM_MODULE_IDS).toContain(required);
    }
  });

  it("prevents deferred, experimental, and excluded modules from appearing as shipped", () => {
    for (const module of PLATFORM_MODULE_IDS.map((id) => PLATFORM_MODULES[id])) {
      if (module.status === "shipped") {
        expect(module.allowedInCurrentShippedKernel, module.id).toBe(true);
        continue;
      }

      expect(module.allowedInCurrentShippedKernel, module.id).toBe(false);
      expect(["deferred", "experimental", "excluded"]).toContain(module.status);

      for (const slug of module.deferredCapabilitySlugs ?? []) {
        expect(DEFERRED_CAPABILITY_SLUGS.has(slug), `${module.id} references ${slug}`).toBe(true);
      }
    }
  });

  it("requires every shipped module to name owner surfaces and release proof", () => {
    for (const module of PLATFORM_MODULE_IDS.map((id) => PLATFORM_MODULES[id])) {
      if (module.status !== "shipped") continue;

      expect(hasOwnerSurface(module), `${module.id} needs owner surfaces`).toBe(true);
      expect(module.requiredTestsOrReleaseGates.length, `${module.id} needs tests/gates`).toBeGreaterThan(0);
      expect(
        module.requiredTestsOrReleaseGates.some((entry) => entry.startsWith("test:") || entry.startsWith("tests/")),
        `${module.id} needs concrete test or script evidence`
      ).toBe(true);
      expect(module.promotionCriteria.length, `${module.id} needs promotion criteria`).toBeGreaterThan(0);
      expect(module.notAllowed.length, `${module.id} needs anti-scope rules`).toBeGreaterThan(0);
    }
  });

  it("requires entitlement-gated modules to declare their gate source and commercial features", () => {
    for (const module of PLATFORM_MODULE_IDS.map((id) => PLATFORM_MODULES[id])) {
      expect(module.gate.policy.trim().length, `${module.id} needs gate policy`).toBeGreaterThan(0);

      if (module.gate.source === "commercial_feature" || module.gate.source === "export_preset") {
        expect(module.gate.commercialFeatures?.length, `${module.id} needs commercial feature mapping`).toBeGreaterThan(0);
        expect(module.gate.minimumPlan, `${module.id} needs a non-empty plan gate`).not.toBe("none");
      }

      if (module.gate.source === "internal_role") {
        expect(module.gate.minimumPlan, module.id).toBe("internal_only");
      }

      if (module.status === "deferred" || module.status === "experimental") {
        expect(module.gate.source, module.id).toBe("future_policy");
      }

      if (module.status === "excluded") {
        expect(module.gate.source, module.id).toBe("excluded");
      }
    }
  });

  it("keeps platform module docs aligned with registry status", () => {
    const registryDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");
    const architectureDoc = readRepoFile("docs", "ARCHITECTURE_BOUNDARIES.md");
    const productTruthDoc = readRepoFile("docs", "CURRENT_PRODUCT_TRUTH.md");

    for (const module of PLATFORM_MODULE_IDS.map((id) => PLATFORM_MODULES[id])) {
      const expectedKernelValue = module.allowedInCurrentShippedKernel ? "yes" : "no";
      expect(registryDoc, module.id).toContain(
        `| \`${module.id}\` | ${module.status} | ${expectedKernelValue} |`
      );
    }

    expect(architectureDoc).toContain("PLATFORM_MODULE_REGISTRY.md");
    expect(productTruthDoc).toContain("PLATFORM_MODULE_REGISTRY.md");
    expect(registryDoc).toContain("A module may move from deferred or experimental to shipped only when");
    expect(registryDoc).toContain("Deferred, experimental, and excluded modules must not appear in customer navigation");
  });
});
