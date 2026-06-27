import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS,
  ENTERPRISE_IDENTITY_PACKAGE_GATE,
  ENTERPRISE_IDENTITY_STATE_REGISTRY,
  ENTERPRISE_PROVISIONING_STATES,
  ENTERPRISE_SSO_CONFIGURATION_STATES
} from "@/lib/product/enterprise-identity";
import {
  ENTERPRISE_IDENTITY_ROUTE_CONTRACTS,
  ENTERPRISE_IDENTITY_ROUTE_IDS,
  ENTERPRISE_IDENTITY_VALIDATION_CONTRACTS,
  ENTERPRISE_IDENTITY_VALIDATION_CONTRACT_IDS
} from "@/lib/product/enterprise-identity-routes";
import {
  ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS,
  ENTERPRISE_IDENTITY_SCHEMA_TABLES,
  ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS,
  isEnterpriseIdentitySchemaSafeMetadataField
} from "@/lib/product/enterprise-identity-schema";
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

const allIdentityStates = new Set([
  ...ENTERPRISE_SSO_CONFIGURATION_STATES,
  ...ENTERPRISE_PROVISIONING_STATES
]);

describe("enterprise identity schema and route contracts", () => {
  it("defines future org-scoped table contracts with lifecycle, indexes, timestamps, and audit linkage", () => {
    expect(ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS).toEqual([
      "enterprise_sso_configurations",
      "enterprise_verified_domains",
      "enterprise_scim_users",
      "enterprise_group_role_mappings",
      "enterprise_identity_events"
    ]);

    for (const tableId of ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS) {
      const table = ENTERPRISE_IDENTITY_SCHEMA_TABLES[tableId];
      expect(table.id).toBe(tableId);
      expect(table.status, tableId).toBe("future");
      expect(table.allowedInCurrentRuntime, tableId).toBe(false);
      expect(table.organizationIdRequired, tableId).toBe(true);
      expect(table.lifecycleField.trim().length, tableId).toBeGreaterThan(0);
      expect(table.lifecycleStates.length, `${tableId} needs lifecycle states`).toBeGreaterThan(0);
      expect(table.providerTypes.length, `${tableId} needs provider type ownership`).toBeGreaterThan(0);
      expect(table.timestampFields, `${tableId} needs created_at`).toContain("created_at");
      expect(table.timestampFields, `${tableId} needs updated_at`).toContain("updated_at");
      expect(table.uniquenessConstraints.length, `${tableId} needs uniqueness`).toBeGreaterThan(0);
      expect(table.requiredIndexes.length, `${tableId} needs indexes`).toBeGreaterThan(0);
      expect(table.deletionOrDeprovisioningBehavior.length, `${tableId} needs deletion semantics`).toBeGreaterThan(30);
      expect(table.auditEventLinkage.length, `${tableId} needs audit linkage`).toBeGreaterThan(0);
      expect(table.requiredTestsOrReleaseGates, tableId).toContain(
        "tests/enterprise-identity-schema-routes.test.ts"
      );

      for (const lifecycleState of table.lifecycleStates) {
        expect(allIdentityStates.has(lifecycleState), `${tableId} references ${lifecycleState}`).toBe(
          true
        );
        expect(ENTERPRISE_IDENTITY_STATE_REGISTRY[lifecycleState].id).toBe(lifecycleState);
      }

      for (const auditEventName of table.auditEventLinkage) {
        expect(ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS[auditEventName].status).toBe("future");
      }
    }
  });

  it("keeps raw IdP, SCIM, secret, and provider fields out of safe schema metadata", () => {
    for (const tableId of ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS) {
      const table = ENTERPRISE_IDENTITY_SCHEMA_TABLES[tableId];
      expect(table.forbiddenRawFields).toEqual(
        expect.arrayContaining([
          "raw_saml_assertion",
          "raw_scim_payload",
          "full_scim_payload",
          "provider_payload",
          "client_secret",
          "private_key",
          "x509_certificate"
        ])
      );

      for (const forbiddenField of ENTERPRISE_IDENTITY_SCHEMA_FORBIDDEN_RAW_FIELDS) {
        expect(table.safeMetadataFields, `${tableId} should not mark ${forbiddenField} safe`).not.toContain(
          forbiddenField
        );
        expect(isEnterpriseIdentitySchemaSafeMetadataField(tableId, forbiddenField)).toBe(false);
      }
    }
  });

  it("defines future-only route contracts for SSO, SCIM, group mapping, and admin recovery", () => {
    expect(ENTERPRISE_IDENTITY_ROUTE_IDS).toEqual([
      "get_sso_configuration",
      "upsert_sso_configuration",
      "upload_sso_metadata",
      "start_domain_verification",
      "test_sso_configuration",
      "scim_create_user",
      "scim_update_user",
      "scim_delete_user",
      "list_group_role_mappings",
      "upsert_group_role_mapping",
      "enterprise_admin_recovery"
    ]);

    for (const routeId of ENTERPRISE_IDENTITY_ROUTE_IDS) {
      const route = ENTERPRISE_IDENTITY_ROUTE_CONTRACTS[routeId];
      expect(route.status, routeId).toBe("deferred");
      expect(route.allowedRuntimeToday, routeId).toBe(false);
      expect(route.requiredPlanOrGate, routeId).toBe("enterprise");
      expect(route.path, routeId).toMatch(/^\/api\/enterprise\/identity\//);
      expect(route.requiredTestsOrReleaseGates, routeId).toContain(
        "tests/enterprise-identity-schema-routes.test.ts"
      );
      expect(route.rateLimitPolicy.length, `${routeId} needs a rate-limit policy`).toBeGreaterThan(15);
      expect(route.idempotencyExpectation.length, `${routeId} needs idempotency policy`).toBeGreaterThan(15);
      expect(route.monitoringEventName, `${routeId} needs monitoring`).toMatch(/^enterprise_identity_/);
      expect(ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS[route.auditEventName].status).toBe("future");
      expect(ENTERPRISE_IDENTITY_VALIDATION_CONTRACTS[route.validationContractId].status).toBe("future");

      const permissionRule = ENTERPRISE_SENSITIVE_ACTION_RULES[route.requiredRoleOrCapability];
      expect(permissionRule.status, routeId).toBe("deferred");
      expect(permissionRule.minimumPlanOrGate, routeId).toBe("enterprise");
      expect(permissionRule.allowedCustomerRoles, routeId).toEqual([]);
      expect(permissionRule.allowedInternalRoles, routeId).toEqual([]);

      for (const lifecycleState of route.lifecycleStateReferences) {
        expect(allIdentityStates.has(lifecycleState), `${routeId} references ${lifecycleState}`).toBe(
          true
        );
      }
    }
  });

  it("captures SCIM provisioning/deprovisioning and break-glass recovery as future-only semantics", () => {
    expect(ENTERPRISE_IDENTITY_ROUTE_CONTRACTS.scim_create_user.provisioningSemantics).toMatchObject({
      operation: "create",
      statesEntered: ["pending", "active"]
    });
    expect(ENTERPRISE_IDENTITY_ROUTE_CONTRACTS.scim_update_user.provisioningSemantics?.statesEntered).toEqual(
      expect.arrayContaining(["pending", "active", "locked"])
    );
    expect(ENTERPRISE_IDENTITY_ROUTE_CONTRACTS.scim_delete_user.provisioningSemantics).toMatchObject({
      operation: "soft_delete",
      deprovisioningState: "soft_deprovisioned"
    });

    const recovery = ENTERPRISE_IDENTITY_ROUTE_CONTRACTS.enterprise_admin_recovery;
    expect(recovery.authBoundary).toBe("future_enterprise_admin_break_glass");
    expect(recovery.requiredRoleOrCapability).toBe("future_admin_delegation");
    expect(recovery.allowedRuntimeToday).toBe(false);
    expect(recovery.requiredPlanOrGate).toBe("enterprise");
    expect(recovery.auditEventName).toBe("enterprise.admin_recovery_used");
    expect(recovery.rateLimitPolicy).toMatch(/P0|break-glass/i);
  });

  it("defines validation contracts that reject or redact raw assertions, tokens, certs, secrets, and provider payloads", () => {
    expect(ENTERPRISE_IDENTITY_VALIDATION_CONTRACT_IDS).toEqual([
      "saml_metadata",
      "oidc_issuer_client_metadata",
      "domain_verification_request",
      "sso_test_request",
      "scim_user_create_payload",
      "scim_user_update_payload",
      "scim_user_delete_payload",
      "group_role_mapping_payload",
      "admin_recovery_payload"
    ]);

    for (const contractId of ENTERPRISE_IDENTITY_VALIDATION_CONTRACT_IDS) {
      const contract = ENTERPRISE_IDENTITY_VALIDATION_CONTRACTS[contractId];
      expect(contract.status, contractId).toBe("future");
      expect(contract.allowedRuntimeToday, contractId).toBe(false);
      expect(contract.rejectRawProviderPayloads, contractId).toBe(true);
      expect(contract.requiredRedactionBehavior.length, contractId).toBeGreaterThan(0);
      expect(contract.auditLoggingConstraints.length, contractId).toBeGreaterThan(20);
      expect(contract.monitoringConstraints.length, contractId).toBeGreaterThan(20);
      expect(contract.forbiddenInputFields).toEqual(
        expect.arrayContaining([
          "raw_saml_assertion",
          "saml_response",
          "id_token",
          "access_token",
          "refresh_token",
          "client_secret",
          "private_key",
          "x509_certificate",
          "raw_scim_payload",
          "full_scim_payload",
          "provider_payload"
        ])
      );

      for (const safeField of contract.safeInputFields) {
        expect(contract.forbiddenInputFields, `${contractId} should not allow ${safeField}`).not.toContain(
          safeField
        );
      }
    }
  });

  it("keeps the platform module and package gate aligned with schema and route contracts", () => {
    const module = PLATFORM_MODULES.enterprise_identity_rbac_retention;
    expect(module.status).toBe("deferred");
    expect(module.allowedInCurrentShippedKernel).toBe(false);
    expect(module.gate.minimumPlan).toBe("enterprise");
    expect(module.ownerSurfaces.modules).toEqual(
      expect.arrayContaining([
        "lib/product/enterprise-identity.ts",
        "lib/product/enterprise-identity-runtime.ts",
        "lib/product/enterprise-identity-schema.ts",
        "lib/product/enterprise-identity-routes.ts"
      ])
    );
    expect(module.ownerSurfaces.docs).toContain(
      "docs/enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md"
    );
    expect(module.requiredTestsOrReleaseGates).toContain(
      "tests/enterprise-identity-schema-routes.test.ts"
    );

    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.requiredDocs).toContain(
      "docs/enterprise/ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md"
    );
    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.requiredTestsOrReleaseGates).toContain(
      "tests/enterprise-identity-schema-routes.test.ts"
    );
  });

  it("does not expose current SSO or SCIM setup in navigation or app/api runtime routes", () => {
    const navigationText = SHIPPED_FIRST_SCOPE.customerNavigation
      .map((item) => `${item.href} ${item.label}`)
      .join(" ");
    expect(navigationText).not.toMatch(/sso|scim|saml|oidc|identity provider|directory sync/i);

    const apiFiles = listFiles(path.join(repoRoot, "app", "api"));
    const enterpriseIdentityRuntimeRoutes = apiFiles.filter((filePath) =>
      filePath.replace(/\\/g, "/").match(/app\/api\/enterprise\/identity\/.*route\.(ts|tsx)$/)
    );
    expect(enterpriseIdentityRuntimeRoutes).toEqual([]);
  });

  it("documents the schema, route, validation, packaging, and future-only boundaries", () => {
    const schemaRoutesDoc = readRepoFile(
      "docs",
      "enterprise",
      "ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md"
    );
    const implementationPlan = readRepoFile(
      "docs",
      "enterprise",
      "ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md"
    );
    const rbacBoundary = readRepoFile("docs", "ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md");
    const moduleRegistry = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");

    for (const tableId of ENTERPRISE_IDENTITY_SCHEMA_TABLE_IDS) {
      expect(schemaRoutesDoc, tableId).toContain(`\`${tableId}\``);
    }

    for (const route of Object.values(ENTERPRISE_IDENTITY_ROUTE_CONTRACTS)) {
      const portableDocPath = route.path.replace("/Users/:id", "/Users&#47;:id");
      expect(schemaRoutesDoc, route.path).toContain(`\`${route.method} ${portableDocPath}\``);
    }

    for (const contractId of ENTERPRISE_IDENTITY_VALIDATION_CONTRACT_IDS) {
      expect(schemaRoutesDoc, contractId).toContain(`\`${contractId}\``);
    }

    expect(schemaRoutesDoc).toContain("not currently shipped");
    expect(schemaRoutesDoc).toContain("must not log raw IdP assertions");
    expect(schemaRoutesDoc).toContain("enterprise-identity-runtime.ts");
    expect(implementationPlan).toContain("ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md");
    expect(implementationPlan).toContain("Current Safe Runtime Bridge");
    expect(rbacBoundary).toContain("ENTERPRISE_IDENTITY_SCHEMA_AND_ROUTES.md");
    expect(moduleRegistry).toContain("lib/product/enterprise-identity-schema.ts");
    expect(moduleRegistry).toContain("lib/product/enterprise-identity-runtime.ts");
    expect(moduleRegistry).toContain("lib/product/enterprise-identity-routes.ts");
    expect(moduleRegistry).toContain("tests/enterprise-identity-schema-routes.test.ts");
  });
});
