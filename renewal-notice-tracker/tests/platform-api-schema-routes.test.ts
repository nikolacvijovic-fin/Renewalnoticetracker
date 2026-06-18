import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FUTURE_API_SCOPES,
  PLATFORM_API_CAPABILITIES,
  PLATFORM_API_CAPABILITY_IDS
} from "@/lib/product/platform-api";
import {
  PLATFORM_API_ROUTE_CONTRACTS,
  PLATFORM_API_ROUTE_IDS,
  PLATFORM_API_VALIDATION_CONTRACTS,
  PLATFORM_API_VALIDATION_CONTRACT_IDS
} from "@/lib/product/platform-api-routes";
import {
  PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS,
  PLATFORM_API_SCHEMA_TABLES,
  PLATFORM_API_SCHEMA_TABLE_IDS,
  isPlatformApiSchemaSafeMetadataField
} from "@/lib/product/platform-api-schema";
import { ENTERPRISE_SENSITIVE_ACTION_RULES } from "@/lib/product/enterprise-rbac";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

function listFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(fullPath);
    }
    return [fullPath];
  });
}

describe("public API and integration schema and route contracts", () => {
  it("defines future org-scoped API and integration table contracts", () => {
    expect(PLATFORM_API_SCHEMA_TABLE_IDS).toEqual([
      "api_tokens",
      "api_token_events",
      "oauth_connections",
      "integration_connections",
      "customer_webhook_endpoints",
      "customer_webhook_deliveries",
      "integration_event_ledger",
      "integration_sync_jobs"
    ]);

    for (const tableId of PLATFORM_API_SCHEMA_TABLE_IDS) {
      const table = PLATFORM_API_SCHEMA_TABLES[tableId];
      expect(table.id).toBe(tableId);
      expect(["deferred", "future"]).toContain(table.status);
      expect(table.allowedInCurrentRuntime, tableId).toBe(false);
      expect(table.organizationIdRequired, tableId).toBe(true);
      expect(table.lifecycleField.trim().length, `${tableId} needs status/lifecycle`).toBeGreaterThan(0);
      expect(table.lifecycleStates.length, `${tableId} needs lifecycle states`).toBeGreaterThan(0);
      expect(table.timestampFields, `${tableId} needs created_at`).toContain("created_at");
      expect(table.timestampFields, `${tableId} needs updated_at`).toContain("updated_at");
      expect(table.uniquenessConstraints.length, `${tableId} needs uniqueness rules`).toBeGreaterThan(0);
      expect(table.requiredIndexes.length, `${tableId} needs indexes`).toBeGreaterThan(0);
      expect(table.deletionOrRevocationBehavior.length, `${tableId} needs revoke/delete rules`).toBeGreaterThan(30);
      expect(table.auditEventLinkage.length, `${tableId} needs audit linkage`).toBeGreaterThan(0);
      expect(table.monitoringEventLinkage.length, `${tableId} needs monitoring linkage`).toBeGreaterThan(0);
      expect(table.requiredTestsOrReleaseGates, tableId).toContain(
        "tests/platform-api-schema-routes.test.ts"
      );

      for (const capabilityId of table.owningCapabilities) {
        expect(PLATFORM_API_CAPABILITY_IDS, `${tableId} references ${capabilityId}`).toContain(
          capabilityId
        );
      }

      for (const scope of table.requiredScopes) {
        expect(FUTURE_API_SCOPES, `${tableId} references ${scope}`).toContain(scope);
      }
    }
  });

  it("keeps raw tokens, secrets, provider payloads, and customer content out of safe schema metadata", () => {
    const expectedForbidden = [
      "raw_api_token",
      "api_token_secret",
      "internal_route_secret",
      "oauth_client_secret",
      "oauth_access_token",
      "webhook_signing_secret",
      "provider_payload",
      "raw_webhook_payload",
      "raw_contract_text",
      "ocr_output",
      "raw_extracted_evidence",
      "full_note_text",
      "storage_path"
    ];

    for (const tableId of PLATFORM_API_SCHEMA_TABLE_IDS) {
      const table = PLATFORM_API_SCHEMA_TABLES[tableId];
      expect(table.forbiddenRawFields).toEqual(expect.arrayContaining(expectedForbidden));

      for (const forbiddenField of PLATFORM_API_SCHEMA_FORBIDDEN_RAW_FIELDS) {
        expect(table.safeMetadataFields, `${tableId} should not mark ${forbiddenField} safe`).not.toContain(
          forbiddenField
        );
        expect(isPlatformApiSchemaSafeMetadataField(tableId, forbiddenField)).toBe(false);
      }
    }
  });

  it("defines inactive future route contracts with auth, scopes, rate limits, idempotency, audit, and monitoring", () => {
    expect(PLATFORM_API_ROUTE_IDS).toEqual([
      "list_contracts",
      "read_contract",
      "create_export",
      "read_export",
      "list_audit_events",
      "create_webhook_endpoint",
      "update_webhook_endpoint",
      "delete_webhook_endpoint",
      "create_api_token",
      "rotate_api_token",
      "revoke_api_token",
      "list_integrations",
      "oauth_callback",
      "trigger_integration_sync",
      "provider_webhook_callback"
    ]);

    for (const routeId of PLATFORM_API_ROUTE_IDS) {
      const route = PLATFORM_API_ROUTE_CONTRACTS[routeId];
      expect(route.id).toBe(routeId);
      expect(["deferred", "future"]).toContain(route.status);
      expect(route.allowedRuntimeToday, routeId).toBe(false);
      expect(route.path, routeId).toMatch(/^\/api\/v1\//);
      expect(route.requiredAuthModel, routeId).toBeTruthy();
      expect(route.requiredScopes.length, `${routeId} needs scopes`).toBeGreaterThan(0);
      expect(route.rateLimitPolicy.length, `${routeId} needs rate-limit policy`).toBeGreaterThan(15);
      expect(route.idempotencyExpectation.length, `${routeId} needs idempotency policy`).toBeGreaterThan(15);
      expect(route.auditEventExpectation.length, `${routeId} needs audit expectation`).toBeGreaterThan(15);
      expect(route.monitoringEventExpectation, routeId).toMatch(/^platform_api_/);
      expect(route.requiredSecurityControls.length, `${routeId} needs security controls`).toBeGreaterThan(0);
      expect(route.requiredTestsOrReleaseGates, routeId).toContain(
        "tests/platform-api-schema-routes.test.ts"
      );
      expect(PLATFORM_API_VALIDATION_CONTRACTS[route.validationContractId].status).toBeTruthy();

      const permissionRule = ENTERPRISE_SENSITIVE_ACTION_RULES[route.requiredRoleOrCapability];
      expect(permissionRule.status, routeId).toBe("deferred");
      expect(permissionRule.minimumPlanOrGate, routeId).toBe("enterprise");
      expect(permissionRule.allowedCustomerRoles, routeId).toEqual([]);
      expect(permissionRule.allowedInternalRoles, routeId).toEqual([]);

      for (const capabilityId of route.owningCapabilities) {
        expect(PLATFORM_API_CAPABILITY_IDS, `${routeId} references ${capabilityId}`).toContain(
          capabilityId
        );
      }

      for (const scope of route.requiredScopes) {
        expect(FUTURE_API_SCOPES, `${routeId} references ${scope}`).toContain(scope);
      }
    }
  });

  it("keeps public API token routes separate from internal route secrets", () => {
    for (const routeId of ["create_api_token", "rotate_api_token", "revoke_api_token"] as const) {
      const route = PLATFORM_API_ROUTE_CONTRACTS[routeId];
      expect(route.requiredAuthModel, routeId).toBe("future_enterprise_admin_session");
      expect(route.requiredScopes, routeId).toContain("admin:write");
      expect(route.forbiddenRequestLogAuditFields, routeId).toEqual(
        expect.arrayContaining([
          "raw_api_token",
          "api_token_secret",
          "internal_route_secret",
          "cron_secret",
          "destructive_operation_secret",
          "billing_webhook_secret",
          "monitoring_webhook_secret"
        ])
      );
      expect(route.requiredSecurityControls.join(" "), routeId).toMatch(/one-time secret|revocation|raw token/i);
      expect(route.requiredAuthModel, routeId).not.toBe("internal_secret");
    }
  });

  it("requires signing, replay protection, and idempotency for webhook endpoint and provider routes", () => {
    for (const routeId of [
      "create_webhook_endpoint",
      "update_webhook_endpoint",
      "delete_webhook_endpoint",
      "provider_webhook_callback"
    ] as const) {
      const route = PLATFORM_API_ROUTE_CONTRACTS[routeId];
      const controls = `${route.requiredSecurityControls.join(" ")} ${route.idempotencyExpectation}`.toLowerCase();
      expect(controls, routeId).toMatch(/sign|signature/);
      expect(controls, routeId).toContain("replay");
      expect(controls, routeId).toContain("idempotency");
      expect(route.requiredScopes, routeId).toEqual(
        expect.arrayContaining(routeId === "provider_webhook_callback" ? ["webhooks:manage"] : ["webhooks:manage"])
      );
    }
  });

  it("requires state verification and provider-specific scopes for OAuth callback routes", () => {
    const route = PLATFORM_API_ROUTE_CONTRACTS.oauth_callback;
    const controls = `${route.requiredSecurityControls.join(" ")} ${route.idempotencyExpectation}`.toLowerCase();
    expect(route.requiredAuthModel).toBe("future_oauth_connection");
    expect(route.validationContractId).toBe("oauth_callback");
    expect(controls).toContain("state");
    expect(controls).toContain("provider-specific scopes");
    expect(controls).toContain("replay");

    const validation = PLATFORM_API_VALIDATION_CONTRACTS.oauth_callback;
    expect(validation.normalizationExpectation).toMatch(/state nonce/i);
    expect(validation.forbiddenRawOrSensitiveFields).toEqual(
      expect.arrayContaining(["oauth_authorization_code", "oauth_access_token", "oauth_refresh_token"])
    );
  });

  it("defines validation contracts that redact or reject sensitive API, OAuth, webhook, provider, and customer payloads", () => {
    expect(PLATFORM_API_VALIDATION_CONTRACT_IDS).toEqual([
      "api_token_create",
      "api_token_rotate",
      "api_token_revoke",
      "contract_list_query",
      "contract_read_query",
      "export_job_create",
      "export_job_read",
      "audit_event_list_query",
      "webhook_endpoint_create",
      "webhook_endpoint_update",
      "webhook_endpoint_delete",
      "oauth_callback",
      "integration_sync_request",
      "provider_webhook_payload"
    ]);

    for (const contractId of PLATFORM_API_VALIDATION_CONTRACT_IDS) {
      const contract = PLATFORM_API_VALIDATION_CONTRACTS[contractId];
      expect(["deferred", "future"]).toContain(contract.status);
      expect(contract.allowedRuntimeToday, contractId).toBe(false);
      expect(contract.safeInputFields.length, `${contractId} needs safe inputs`).toBeGreaterThan(0);
      expect(contract.redactionBehavior.length, `${contractId} needs redaction behavior`).toBeGreaterThan(0);
      expect(contract.normalizationExpectation.length, `${contractId} needs normalization`).toBeGreaterThan(20);
      expect(contract.failureBehavior.length, `${contractId} needs failure behavior`).toBeGreaterThan(20);
      expect(contract.auditLoggingConstraints.length, `${contractId} needs audit constraints`).toBeGreaterThan(20);
      expect(contract.monitoringConstraints.length, `${contractId} needs monitoring constraints`).toBeGreaterThan(20);
      expect(contract.forbiddenRawOrSensitiveFields).toEqual(
        expect.arrayContaining([
          "raw_api_token",
          "oauth_client_secret",
          "oauth_access_token",
          "provider_payload",
          "raw_contract_text",
          "ocr_output",
          "full_note_text",
          "storage_path"
        ])
      );

      for (const safeField of contract.safeInputFields) {
        expect(contract.forbiddenRawOrSensitiveFields, `${contractId} should not allow ${safeField}`).not.toContain(
          safeField
        );
      }
    }
  });

  it("keeps platform module and docs aligned with schema and route registries", () => {
    const module = PLATFORM_MODULES.enterprise_integrations;
    expect(module.status).toBe("deferred");
    expect(module.allowedInCurrentShippedKernel).toBe(false);
    expect(module.ownerSurfaces.modules).toEqual(
      expect.arrayContaining([
        "lib/product/platform-api.ts",
        "lib/product/platform-api-schema.ts",
        "lib/product/platform-api-routes.ts"
      ])
    );
    expect(module.ownerSurfaces.docs).toContain(
      "docs/enterprise/API_INTEGRATION_SCHEMA_AND_ROUTES.md"
    );
    expect(module.requiredTestsOrReleaseGates).toContain(
      "tests/platform-api-schema-routes.test.ts"
    );

    const boundaryDoc = readRepoFile("docs", "API_AND_INTEGRATION_BOUNDARY.md");
    const schemaRoutesDoc = readRepoFile(
      "docs",
      "enterprise",
      "API_INTEGRATION_SCHEMA_AND_ROUTES.md"
    );
    const implementationDoc = readRepoFile(
      "docs",
      "enterprise",
      "API_INTEGRATION_IMPLEMENTATION_PLAN.md"
    );
    const platformDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");

    expect(boundaryDoc).toContain("platform-api-schema.ts");
    expect(boundaryDoc).toContain("platform-api-routes.ts");
    expect(implementationDoc).toContain("API_INTEGRATION_SCHEMA_AND_ROUTES.md");
    expect(platformDoc).toContain("lib/product/platform-api-schema.ts");
    expect(platformDoc).toContain("lib/product/platform-api-routes.ts");
    expect(platformDoc).toContain("tests/platform-api-schema-routes.test.ts");

    for (const tableId of PLATFORM_API_SCHEMA_TABLE_IDS) {
      expect(schemaRoutesDoc, tableId).toContain(`\`${tableId}\``);
    }

    for (const route of Object.values(PLATFORM_API_ROUTE_CONTRACTS)) {
      expect(schemaRoutesDoc, route.path).toContain(`\`${route.method} ${route.path}\``);
    }
  });

  it("does not expose current public API, webhooks, or integrations in navigation/settings/routes", () => {
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
      "Customer webhooks",
      "Slack integration",
      "Teams integration",
      "Data warehouse"
    ]) {
      expect(navigationText, forbidden).not.toContain(forbidden);
      expect(settingsText, forbidden).not.toContain(forbidden);
    }

    const apiRouteFiles = listFiles(path.join(repoRoot, "app", "api"));
    const publicApiV1Routes = apiRouteFiles.filter((filePath) =>
      filePath.replace(/\\/g, "/").match(/app\/api\/v1\/.*route\.(ts|tsx)$/)
    );
    expect(publicApiV1Routes).toEqual([]);
  });
});
