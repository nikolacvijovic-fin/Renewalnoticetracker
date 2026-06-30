import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRODUCT_EVENT_TAXONOMY } from "@/lib/product/event-taxonomy";
import {
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_IDS,
  PLATFORM_DUPLICATED_CONCEPT_INVENTORY,
  PLATFORM_EVENT_REGISTRY,
  PLATFORM_HEALTH_STATES,
  PLATFORM_LIFECYCLE_STATES,
  detectPlatformDependencyCycles,
  getPlatformEventsForCapability,
  getPlatformModuleCapabilityCoverage,
  resolvePlatformCapabilityDependencies,
  validatePlatformRuntimeContext
} from "@/lib/product/platform-orchestration";
import { PLATFORM_MODULES, PLATFORM_MODULE_IDS } from "@/lib/product/platform-modules";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("platform orchestration foundation", () => {
  it("registers unique capabilities with valid lifecycle and health states", () => {
    expect(new Set(PLATFORM_CAPABILITY_IDS).size).toBe(PLATFORM_CAPABILITY_IDS.length);

    for (const capabilityId of PLATFORM_CAPABILITY_IDS) {
      const capability = PLATFORM_CAPABILITIES[capabilityId];
      expect(capability.id, capabilityId).toBe(capabilityId);
      expect(PLATFORM_LIFECYCLE_STATES, capabilityId).toContain(capability.lifecycle);
      expect(PLATFORM_HEALTH_STATES, capabilityId).toContain(capability.health);
      expect(PLATFORM_MODULES[capability.owningModule], capabilityId).toBeDefined();
      expect(capability.docs.length, capabilityId).toBeGreaterThan(0);
      expect(capability.requiredDeploymentGates.length, capabilityId).toBeGreaterThan(0);
      expect(capability.notes.length, capabilityId).toBeGreaterThan(20);
    }
  });

  it("covers every non-excluded platform module with at least one orchestration capability", () => {
    const coverage = getPlatformModuleCapabilityCoverage();

    for (const moduleId of PLATFORM_MODULE_IDS) {
      const module = PLATFORM_MODULES[moduleId];
      if (module.status === "excluded") continue;
      expect(coverage[moduleId]?.length, moduleId).toBeGreaterThan(0);
    }

    expect(coverage.advanced_retention_governance_analytics).toContain("revenue_intelligence");
    expect(coverage.enterprise_identity_rbac_retention).toContain("identity");
  });

  it("resolves capability dependencies and prevents circular dependencies", () => {
    expect(detectPlatformDependencyCycles()).toEqual([]);

    for (const capabilityId of PLATFORM_CAPABILITY_IDS) {
      const capability = PLATFORM_CAPABILITIES[capabilityId];
      for (const dependency of capability.dependencies) {
        expect(PLATFORM_CAPABILITIES[dependency], `${capabilityId} -> ${dependency}`).toBeDefined();
      }
    }

    expect(resolvePlatformCapabilityDependencies("revenue_intelligence")).toEqual(
      expect.arrayContaining(["market_profiles", "compliance", "ai_generation", "approval_queue", "audit", "monitoring"])
    );
    expect(resolvePlatformCapabilityDependencies("contract_intelligence")).toEqual(
      expect.arrayContaining(["contracts", "ocr", "ai_generation", "billing", "audit", "monitoring"])
    );
  });

  it("keeps required audit events backed by the product event taxonomy", () => {
    for (const capability of PLATFORM_CAPABILITY_IDS.map((id) => PLATFORM_CAPABILITIES[id])) {
      for (const eventName of capability.requiredAuditEvents) {
        const event = PRODUCT_EVENT_TAXONOMY[eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
        expect(event, `${capability.id} requires ${eventName}`).toBeDefined();
        expect(event.type, eventName).toBe("audit");
      }
    }

    for (const event of PLATFORM_EVENT_REGISTRY) {
      expect(PRODUCT_EVENT_TAXONOMY[event.eventName as keyof typeof PRODUCT_EVENT_TAXONOMY], event.eventName).toBeDefined();
      expect(PLATFORM_CAPABILITIES[event.owningCapability], event.eventName).toBeDefined();
      expect(PLATFORM_MODULES[event.owningModule], event.eventName).toBeDefined();
    }

    expect(getPlatformEventsForCapability("contract_intelligence").length).toBeGreaterThan(0);
  });

  it("validates the canonical platform runtime context", () => {
    expect(
      validatePlatformRuntimeContext({
        organization: { organizationId: "org-1", active: true },
        workspace: { workspaceId: "workspace-1", activeOrganizationId: "org-1" },
        market: { marketId: "global", runtimeEnabled: true },
        identity: { actorUserId: "user-1", role: "admin" },
        subscription: {
          planTier: "growth",
          subscriptionStatus: "active",
          commercialFeatures: ["exports"]
        },
        providerPolicies: { providers: ["paddle", "supabase"] },
        featureGates: { enabledCapabilities: ["contracts", "renewals", "exports"] },
        approvalContext: { approvalRequired: false, approvalIds: [] },
        auditContext: { requestId: "req-1", auditBoundary: "customer_truth" },
        monitoringContext: { requestId: "req-1", health: "healthy" }
      })
    ).toEqual({ valid: true, reasonCodes: [] });

    expect(
      validatePlatformRuntimeContext({
        organization: { organizationId: "org-1", active: false },
        workspace: { workspaceId: "workspace-1", activeOrganizationId: "org-2" },
        market: { marketId: "global", runtimeEnabled: true },
        identity: { actorUserId: "user-1", role: "admin" },
        subscription: {
          planTier: "growth",
          subscriptionStatus: "active",
          commercialFeatures: []
        },
        providerPolicies: { providers: [] },
        featureGates: { enabledCapabilities: ["contracts"] },
        approvalContext: { approvalRequired: false, approvalIds: [] },
        auditContext: { auditBoundary: "customer_truth" },
        monitoringContext: { health: "healthy" }
      })
    ).toEqual({
      valid: false,
      reasonCodes: ["organization_inactive", "workspace_org_mismatch"]
    });
  });

  it("documents duplicated concepts and the orchestration philosophy", () => {
    const doc = readRepoFile("docs", "PLATFORM_ORCHESTRATION_FOUNDATION.md");
    const architectureDoc = readRepoFile("docs", "ARCHITECTURE_BOUNDARIES.md");

    for (const concept of ["organization", "provider", "market_profile", "audit", "monitoring", "billing"] as const) {
      expect(PLATFORM_DUPLICATED_CONCEPT_INVENTORY[concept].appearsIn.length, concept).toBeGreaterThan(0);
      expect(doc).toContain(`\`${concept}\``);
    }

    expect(doc).toContain("Platform Capability Registry");
    expect(doc).toContain("No end-user functionality is shipped by this layer");
    expect(doc).toContain("Revenue Intelligence");
    expect(doc).toContain("Market Expansion");
    expect(doc).toContain("Enterprise Identity");
    expect(architectureDoc).toContain("PLATFORM_ORCHESTRATION_FOUNDATION.md");
  });
});
