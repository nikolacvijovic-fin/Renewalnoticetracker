import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFERRED_CAPABILITY_SLUGS } from "@/lib/product/deferred-capabilities";
import {
  API_SCOPE_REGISTRY,
  CUSTOMER_WEBHOOK_CONTRACT,
  FUTURE_API_SCOPES,
  PLATFORM_API_CAPABILITIES,
  PLATFORM_API_CAPABILITY_IDS,
  PUBLIC_API_TOKEN_CONTRACT
} from "@/lib/product/platform-api";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("public API and integration boundary", () => {
  it("keeps public API and integration capabilities deferred or future", () => {
    for (const capabilityId of PLATFORM_API_CAPABILITY_IDS) {
      const capability = PLATFORM_API_CAPABILITIES[capabilityId];

      expect(capability.status, capabilityId).not.toBe("shipped");
      expect(["deferred", "future", "excluded"]).toContain(capability.status);
      expect(capability.allowedRuntimeSurfaceToday, capabilityId).not.toBe("customer_runtime");
      expect(capability.requiredPlanGate, capabilityId).toBe("enterprise_future");
    }
  });

  it("requires every API and integration capability to declare operating expectations", () => {
    for (const capabilityId of PLATFORM_API_CAPABILITY_IDS) {
      const capability = PLATFORM_API_CAPABILITIES[capabilityId];

      expect(capability.authenticationModel, capabilityId).toBeTruthy();
      expect(capability.requiredScopes.length, `${capabilityId} needs scopes`).toBeGreaterThan(0);
      expect(capability.rateLimitExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.idempotencyExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.auditExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.monitoringExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.requiredTestsOrReleaseGates.length, capabilityId).toBeGreaterThan(0);
      expect(capability.forbiddenBehavior.length, capabilityId).toBeGreaterThan(0);

      for (const scope of capability.requiredScopes) {
        expect(FUTURE_API_SCOPES, `${capabilityId} references unknown scope ${scope}`).toContain(scope);
      }
    }
  });

  it("maps every future API scope to at least one owning capability", () => {
    expect(Object.keys(API_SCOPE_REGISTRY).sort()).toEqual([...FUTURE_API_SCOPES].sort());

    for (const scope of FUTURE_API_SCOPES) {
      const definition = API_SCOPE_REGISTRY[scope];
      expect(["deferred", "future"]).toContain(definition.status);
      expect(definition.owningCapabilities.length, `${scope} needs an owning capability`).toBeGreaterThan(0);

      for (const capabilityId of definition.owningCapabilities) {
        expect(PLATFORM_API_CAPABILITY_IDS).toContain(capabilityId);
        expect(PLATFORM_API_CAPABILITIES[capabilityId].requiredScopes, `${scope} must be declared by ${capabilityId}`).toContain(scope);
      }
    }
  });

  it("keeps public API tokens separate from internal operational secrets", () => {
    expect(PUBLIC_API_TOKEN_CONTRACT.status).toBe("deferred");
    expect(PUBLIC_API_TOKEN_CONTRACT.organizationScoped).toBe(true);
    expect(PUBLIC_API_TOKEN_CONTRACT.scopesRequired).toBe(true);
    expect(PUBLIC_API_TOKEN_CONTRACT.rawTokenLoggingAllowed).toBe(false);
    expect(PUBLIC_API_TOKEN_CONTRACT.safeLogIdentifiers).toEqual(
      expect.arrayContaining(["token_prefix", "token_fingerprint", "organization_id"])
    );
    expect(PUBLIC_API_TOKEN_CONTRACT.forbiddenCredentialSources).toEqual(
      expect.arrayContaining([
        "internal_route_secrets",
        "cron_secrets",
        "destructive_operation_secrets",
        "billing_webhook_secrets",
        "monitoring_webhook_secrets"
      ])
    );

    for (const capability of Object.values(PLATFORM_API_CAPABILITIES)) {
      expect(capability.authenticationModel, capability.id).not.toBe("internal_secret");
    }
  });

  it("keeps customer webhook contracts distinct from current provider/internal webhooks", () => {
    expect(CUSTOMER_WEBHOOK_CONTRACT.status).toBe("deferred");
    expect(CUSTOMER_WEBHOOK_CONTRACT.signingRequired).toBe(true);
    expect(CUSTOMER_WEBHOOK_CONTRACT.replayProtectionRequired).toBe(true);
    expect(CUSTOMER_WEBHOOK_CONTRACT.idempotencyKeyRequired).toBe(true);
    expect(CUSTOMER_WEBHOOK_CONTRACT.currentProviderWebhooksAreGeneralPlatformWebhooks).toBe(false);
    expect(CUSTOMER_WEBHOOK_CONTRACT.forbiddenPayloadFields).toEqual(
      expect.arrayContaining([
        "raw_contract_text",
        "full_note_text",
        "ocr_output",
        "raw_extracted_evidence",
        "provider_payload",
        "secrets",
        "tokens",
        "storage_paths"
      ])
    );
  });

  it("keeps customer navigation and settings free of public API or integration setup surfaces", () => {
    const navigationText = SHIPPED_FIRST_SCOPE.customerNavigation
      .map((item) => `${item.href} ${item.label}`)
      .join(" ");
    const settingsText = [
      readRepoFile("app", "dashboard", "settings", "page.tsx"),
      readRepoFile("components", "forms", "settings-form.tsx")
    ].join("\n");

    for (const forbidden of [
      "API keys",
      "Public API",
      "OAuth app",
      "Slack integration",
      "Teams integration",
      "Data warehouse",
      "Customer webhooks"
    ]) {
      expect(navigationText, forbidden).not.toContain(forbidden);
      expect(settingsText, forbidden).not.toContain(forbidden);
    }
  });

  it("keeps Slack, Teams, ERP, CRM, and data warehouse integrations deferred", () => {
    for (const capabilityId of [
      "slack_integration",
      "teams_integration",
      "crm_procurement_accounting_integrations",
      "data_warehouse_export"
    ] as const) {
      const capability = PLATFORM_API_CAPABILITIES[capabilityId];
      expect(["deferred", "future"]).toContain(capability.status);
      expect(capability.allowedRuntimeSurfaceToday).toBe("none");
      expect(capability.forbiddenBehavior.join(" ")).toMatch(/Do not/i);
    }
  });

  it("keeps platform module and deferred capability registries aligned", () => {
    const module = PLATFORM_MODULES.enterprise_integrations;

    expect(module.status).toBe("deferred");
    expect(module.allowedInCurrentShippedKernel).toBe(false);
    expect(module.ownerSurfaces.modules).toContain("lib/product/platform-api.ts");
    expect(module.ownerSurfaces.docs).toEqual(
      expect.arrayContaining([
        "docs/API_AND_INTEGRATION_BOUNDARY.md",
        "docs/enterprise/API_INTEGRATION_IMPLEMENTATION_PLAN.md"
      ])
    );
    expect(module.requiredTestsOrReleaseGates).toContain("tests/platform-api-boundary.test.ts");
    expect(module.deferredCapabilitySlugs).toEqual(
      expect.arrayContaining(["advanced_integrations", "public_api_integrations"])
    );
    expect(DEFERRED_CAPABILITY_SLUGS.has("public_api_integrations")).toBe(true);
  });

  it("keeps API and integration docs aligned with the registry", () => {
    const boundaryDoc = readRepoFile("docs", "API_AND_INTEGRATION_BOUNDARY.md");
    const implementationDoc = readRepoFile("docs", "enterprise", "API_INTEGRATION_IMPLEMENTATION_PLAN.md");
    const platformDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");

    expect(boundaryDoc).toContain("No scope grants runtime access today.");
    expect(boundaryDoc).toContain("Current Paddle billing webhooks");
    expect(implementationDoc).toContain("Status: future Enterprise planning only.");
    expect(platformDoc).toContain("API_AND_INTEGRATION_BOUNDARY.md");

    for (const scope of FUTURE_API_SCOPES) {
      expect(boundaryDoc, scope).toContain(`\`${scope}\``);
    }
  });
});
