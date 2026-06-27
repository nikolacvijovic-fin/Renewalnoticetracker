import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { INTELLIGENCE_PERMISSION_MATRIX } from "@/lib/intelligence/access";
import {
  SHIPPED_RUNTIME_ACTIONS,
  SHIPPED_RUNTIME_ACTION_MATRIX
} from "@/lib/product/action-matrix";
import {
  ENTERPRISE_ROLE_IDS,
  ENTERPRISE_ROLE_REGISTRY,
  ENTERPRISE_SENSITIVE_ACTION_IDS,
  ENTERPRISE_SENSITIVE_ACTION_RULES,
  FUTURE_ENTERPRISE_ROLES
} from "@/lib/product/enterprise-rbac";
import {
  CUSTOMER_ROLES,
  INTERNAL_ROLES,
  SHIPPED_FIRST_SCOPE
} from "@/lib/product/shipping-profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("enterprise identity and RBAC boundary", () => {
  it("registers current shipped roles, legacy aliases, and future enterprise roles explicitly", () => {
    expect(ENTERPRISE_ROLE_IDS).toEqual(
      expect.arrayContaining([...CUSTOMER_ROLES, ...INTERNAL_ROLES, "member", ...FUTURE_ENTERPRISE_ROLES])
    );

    for (const role of CUSTOMER_ROLES) {
      expect(ENTERPRISE_ROLE_REGISTRY[role].status, role).toBe("shipped");
      expect(ENTERPRISE_ROLE_REGISTRY[role].allowedRuntimeSurface, role).toBe("customer_runtime");
    }

    for (const role of INTERNAL_ROLES) {
      expect(ENTERPRISE_ROLE_REGISTRY[role].status, role).toBe("shipped");
      expect(ENTERPRISE_ROLE_REGISTRY[role].allowedRuntimeSurface, role).toBe("internal_runtime");
      expect(ENTERPRISE_ROLE_REGISTRY[role].requiredPlanOrGate, role).toBe("internal_only");
    }

    expect(ENTERPRISE_ROLE_REGISTRY.member.status).toBe("legacy_alias");
    expect(ENTERPRISE_ROLE_REGISTRY.member.mapsToCurrentRole).toBe("operator");

    for (const role of FUTURE_ENTERPRISE_ROLES) {
      expect(ENTERPRISE_ROLE_REGISTRY[role].status, role).toBe("future");
      expect(ENTERPRISE_ROLE_REGISTRY[role].allowedRuntimeSurface, role).toBe(
        "future_enterprise_runtime"
      );
      expect(ENTERPRISE_ROLE_REGISTRY[role].requiredPlanOrGate, role).toBe("enterprise");
    }
  });

  it("gives every sensitive action an explicit permission rule and release proof", () => {
    expect(Object.keys(ENTERPRISE_SENSITIVE_ACTION_RULES).sort()).toEqual(
      [...ENTERPRISE_SENSITIVE_ACTION_IDS].sort()
    );

    for (const actionId of ENTERPRISE_SENSITIVE_ACTION_IDS) {
      const rule = ENTERPRISE_SENSITIVE_ACTION_RULES[actionId];
      expect(rule.id).toBe(actionId);
      expect(rule.label.trim().length, actionId).toBeGreaterThan(0);
      expect(rule.requiredBoundaries.length, `${actionId} needs boundaries`).toBeGreaterThan(0);
      expect(
        rule.requiredTestsOrReleaseGates.length,
        `${actionId} needs tests or release gates`
      ).toBeGreaterThan(0);
      expect(rule.minimumPlanOrGate, `${actionId} needs an explicit gate`).toBeTruthy();
    }
  });

  it("maps every shipped runtime action into the enterprise permission boundary", () => {
    const mappedShippedActions = new Set(
      Object.values(ENTERPRISE_SENSITIVE_ACTION_RULES)
        .map((rule) => rule.currentShippedRuntimeAction)
        .filter(Boolean)
    );

    for (const action of SHIPPED_RUNTIME_ACTIONS) {
      expect(mappedShippedActions.has(action), `${action} needs enterprise RBAC coverage`).toBe(true);
    }
  });

  it("keeps inherited shipped action rules aligned with the canonical action matrix", () => {
    for (const rule of Object.values(ENTERPRISE_SENSITIVE_ACTION_RULES)) {
      if (!rule.currentShippedRuntimeAction || !rule.inheritsShippedActionRoles) continue;

      const shippedRule = SHIPPED_RUNTIME_ACTION_MATRIX[rule.currentShippedRuntimeAction];
      expect(rule.allowedCustomerRoles, rule.id).toEqual(shippedRule.customerRoles);
      expect(rule.allowedInternalRoles, rule.id).toEqual(shippedRule.internalRoles);
    }
  });

  it("keeps future enterprise roles inert in shipped runtime authorization", () => {
    for (const role of FUTURE_ENTERPRISE_ROLES) {
      const definition = ENTERPRISE_ROLE_REGISTRY[role];
      expect(definition.sensitiveActionsAllowed, role).toEqual([]);
      expect(definition.explicitlyForbiddenActions, role).toEqual(ENTERPRISE_SENSITIVE_ACTION_IDS);
      expect(CUSTOMER_ROLES as readonly string[]).not.toContain(role);
      expect(INTERNAL_ROLES as readonly string[]).not.toContain(role);
    }

    const navigationText = SHIPPED_FIRST_SCOPE.customerNavigation
      .map((item) => `${item.href} ${item.label}`)
      .join(" ");
    for (const role of FUTURE_ENTERPRISE_ROLES) {
      expect(navigationText, role).not.toContain(role);
    }
  });

  it("keeps internal-only and destructive actions behind non-customer boundaries", () => {
    for (const actionId of ["internal_operations", "reminder_dispatch_internal"] as const) {
      const rule = ENTERPRISE_SENSITIVE_ACTION_RULES[actionId];
      expect(rule.allowedCustomerRoles, actionId).toEqual([]);
      expect(rule.allowedInternalRoles, actionId).toEqual(INTERNAL_ROLES);
      expect(rule.requiredBoundaries, actionId).toEqual(
        expect.arrayContaining(["internal_role", "internal_secret"])
      );
      expect(rule.minimumPlanOrGate, actionId).toBe("internal_only");
    }

    const deletionRule = ENTERPRISE_SENSITIVE_ACTION_RULES.workspace_deletion;
    expect(deletionRule.allowedCustomerRoles).toEqual(["owner"]);
    expect(deletionRule.requiredBoundaries).toEqual(
      expect.arrayContaining(["active_organization", "destructive_signed_request"])
    );
  });

  it("documents intelligence future roles without activating them as shipped roles", () => {
    expect(INTELLIGENCE_PERMISSION_MATRIX.view_financial_intelligence.futureRoles).toContain(
      "finance_viewer"
    );
    expect(INTELLIGENCE_PERMISSION_MATRIX.view_risk_scores.futureRoles).toContain("legal_validator");
    expect(ENTERPRISE_ROLE_REGISTRY.finance_viewer.sensitiveActionsAllowed).toEqual([]);
    expect(ENTERPRISE_ROLE_REGISTRY.legal_validator.sensitiveActionsAllowed).toEqual([]);
  });

  it("keeps enterprise identity docs and module registry aligned", () => {
    const rbacDoc = readRepoFile("docs", "ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md");
    const architectureDoc = readRepoFile("docs", "ARCHITECTURE_BOUNDARIES.md");
    const moduleRegistryDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");

    expect(rbacDoc).toContain("Canonical code sources: `lib/product/enterprise-rbac.ts` and `lib/product/enterprise-identity.ts`");
    expect(rbacDoc).toContain("lib/product/enterprise-identity-runtime.ts");
    expect(rbacDoc).toContain("SSO, SCIM, permission groups, retention controls, and delegated enterprise administration are deferred");
    expect(architectureDoc).toContain("ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md");
    expect(moduleRegistryDoc).toContain("ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md");
    expect(moduleRegistryDoc).toContain("tests/enterprise-identity-runtime.test.ts");

    for (const role of FUTURE_ENTERPRISE_ROLES) {
      expect(rbacDoc, role).toContain(`\`${role}\``);
    }

    for (const actionId of [
      "contract_upload_import",
      "export_sensitive_rich_presets",
      "financial_intelligence_access",
      "workspace_deletion",
      "future_sso_settings"
    ]) {
      expect(rbacDoc, actionId).toContain(`\`${actionId}\``);
    }
  });
});
