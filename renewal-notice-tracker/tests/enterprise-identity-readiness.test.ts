import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS,
  ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS,
  ENTERPRISE_IDENTITY_PACKAGE_GATE,
  ENTERPRISE_IDENTITY_STATE_REGISTRY,
  ENTERPRISE_IDENTITY_SUPPORTED_PROVIDERS,
  ENTERPRISE_PROVISIONING_STATES,
  ENTERPRISE_SSO_CONFIGURATION_STATES,
  getEnterpriseIdentityPackagingGateEvidence,
  isEnterpriseIdentityAuditMetadataKeyAllowed,
  isEnterpriseIdentityStateAllowedToday,
  type EnterpriseIdentityAuditEventName
} from "@/lib/product/enterprise-identity";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import {
  ENTERPRISE_SENSITIVE_ACTION_RULES,
  FUTURE_ENTERPRISE_ROLES
} from "@/lib/product/enterprise-rbac";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("enterprise identity implementation readiness", () => {
  it("defines the required future SSO and SCIM lifecycle states", () => {
    expect(ENTERPRISE_IDENTITY_SUPPORTED_PROVIDERS).toEqual(["saml_2_0", "oidc"]);
    expect(ENTERPRISE_SSO_CONFIGURATION_STATES).toEqual([
      "not_configured",
      "configured_disabled",
      "metadata_pending",
      "domain_verification_pending",
      "enabled",
      "degraded",
      "suspended"
    ]);
    expect(ENTERPRISE_PROVISIONING_STATES).toEqual([
      "pending",
      "active",
      "soft_deprovisioned",
      "hard_deprovisioned",
      "locked"
    ]);

    for (const state of [...ENTERPRISE_SSO_CONFIGURATION_STATES, ...ENTERPRISE_PROVISIONING_STATES]) {
      expect(ENTERPRISE_IDENTITY_STATE_REGISTRY[state].id).toBe(state);
      expect(ENTERPRISE_IDENTITY_STATE_REGISTRY[state].description.length, state).toBeGreaterThan(20);
    }
  });

  it("allows only the inert not-configured state in current runtime", () => {
    expect(isEnterpriseIdentityStateAllowedToday("not_configured")).toBe(true);

    for (const state of ENTERPRISE_SSO_CONFIGURATION_STATES) {
      if (state === "not_configured") continue;
      expect(isEnterpriseIdentityStateAllowedToday(state), state).toBe(false);
      expect(ENTERPRISE_IDENTITY_STATE_REGISTRY[state].futureOnly, state).toBe(true);
    }

    for (const state of ENTERPRISE_PROVISIONING_STATES) {
      expect(isEnterpriseIdentityStateAllowedToday(state), state).toBe(false);
      expect(ENTERPRISE_IDENTITY_STATE_REGISTRY[state].futureOnly, state).toBe(true);
    }
  });

  it("defines the future identity audit-event contract with safe metadata rules", () => {
    const requiredEvents: EnterpriseIdentityAuditEventName[] = [
      "identity.sso_config_changed",
      "identity.scim_directory_configured",
      "identity.scim_user_provisioned",
      "identity.scim_user_updated",
      "identity.scim_user_deprovisioned",
      "identity.member_locked",
      "identity.member_unlocked",
      "identity.group_role_mapping_changed",
      "identity.break_glass_policy_checked",
      "enterprise.identity_provider_configured",
      "enterprise.sso_config_changed",
      "enterprise.sso_configured",
      "enterprise.sso_enabled",
      "enterprise.sso_disabled",
      "enterprise.idp_metadata_changed",
      "enterprise.domain_verification_started",
      "enterprise.domain_verification_completed",
      "enterprise.domain_verification_failed",
      "enterprise.scim_user_provisioned",
      "enterprise.scim_user_updated",
      "enterprise.scim_user_deprovisioned",
      "enterprise.identity_member_locked",
      "enterprise.identity_member_unlocked",
      "enterprise.role_group_mapping_changed",
      "enterprise.admin_recovery_used",
      "enterprise.break_glass_admin_preserved",
      "enterprise.break_glass_admin_blocked",
      "enterprise.user_lockout",
      "enterprise.user_recovery"
    ];

    expect(Object.keys(ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS).sort()).toEqual(
      [...requiredEvents].sort()
    );

    for (const eventName of requiredEvents) {
      const contract = ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS[eventName];
      expect(contract.status, eventName).toBe("future");
      expect(contract.entityType, eventName).toBe("enterprise_identity");
      expect(contract.requiredPlanOrGate, eventName).toBe("enterprise");
      expect(contract.allowedSafeMetadataKeys, eventName).toContain("request_id");
      expect(contract.allowedSafeMetadataKeys, eventName).toContain("provider");
      expect(contract.allowedSafeMetadataKeys, eventName).toContain("reason_code");

      for (const forbiddenKey of ENTERPRISE_IDENTITY_FORBIDDEN_AUDIT_METADATA_KEYS) {
        expect(contract.allowedSafeMetadataKeys, `${eventName} should not allow ${forbiddenKey}`).not.toContain(
          forbiddenKey
        );
        expect(isEnterpriseIdentityAuditMetadataKeyAllowed(eventName, forbiddenKey)).toBe(false);
      }
    }

    expect(
      isEnterpriseIdentityAuditMetadataKeyAllowed(
        "enterprise.idp_metadata_changed",
        "certificate_fingerprint"
      )
    ).toBe(true);
    expect(
      isEnterpriseIdentityAuditMetadataKeyAllowed("enterprise.idp_metadata_changed", "x509_certificate")
    ).toBe(false);
    expect(
      isEnterpriseIdentityAuditMetadataKeyAllowed("enterprise.scim_user_provisioned", "scim_payload")
    ).toBe(false);
  });

  it("keeps SSO and SCIM Enterprise-only, deferred, and unavailable to current plans", () => {
    const evidence = getEnterpriseIdentityPackagingGateEvidence();
    const module = PLATFORM_MODULES.enterprise_identity_rbac_retention;

    expect(evidence.module).toBe(module);
    expect(module.status).toBe("deferred");
    expect(module.allowedInCurrentShippedKernel).toBe(false);
    expect(module.gate.source).toBe("future_policy");
    expect(module.gate.minimumPlan).toBe("enterprise");

    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.status).toBe("deferred");
    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.minimumPlan).toBe("enterprise");
    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.enabledForCurrentPlans).toEqual([]);
    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.forbiddenCurrentPlans).toEqual([
      "free",
      "starter",
      "growth",
      "portfolio"
    ]);
    expect(ENTERPRISE_IDENTITY_PACKAGE_GATE.allowedCurrentRuntimeRoutes).toEqual([]);
  });

  it("keeps future SSO/SCIM actions out of current authorization and navigation", () => {
    for (const actionId of ["future_sso_settings", "future_scim_provisioning"] as const) {
      const rule = ENTERPRISE_SENSITIVE_ACTION_RULES[actionId];
      expect(rule.status, actionId).toBe("deferred");
      expect(rule.allowedCustomerRoles, actionId).toEqual([]);
      expect(rule.allowedInternalRoles, actionId).toEqual([]);
      expect(rule.minimumPlanOrGate, actionId).toBe("enterprise");
      expect(rule.requiredBoundaries, actionId).toContain("future_enterprise_gate");
    }

    const navigationText = SHIPPED_FIRST_SCOPE.customerNavigation
      .map((item) => `${item.href} ${item.label}`)
      .join(" ");
    expect(navigationText).not.toMatch(/sso|scim|identity|permission group/i);

    for (const role of FUTURE_ENTERPRISE_ROLES) {
      expect(navigationText).not.toContain(role);
    }
  });

  it("documents lifecycle, audit, packaging, deprovisioning, and lockout expectations", () => {
    const implementationPlan = readRepoFile(
      "docs",
      "enterprise",
      "ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md"
    );
    const adminGuide = readRepoFile("docs", "enterprise", "ENTERPRISE_ADMIN_IDENTITY_GUIDE.md");
    const rbacBoundary = readRepoFile("docs", "ENTERPRISE_IDENTITY_RBAC_BOUNDARY.md");
    const moduleRegistry = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");

    for (const expected of [
      "SAML 2.0",
      "OIDC",
      "SCIM",
      "Login Lifecycle",
      "Invite Lifecycle",
      "Provisioning Lifecycle",
      "Deprovisioning Lifecycle",
      "Lockout And Recovery Lifecycle",
      "Domain Verification",
      "IdP Metadata And Certificate Rotation",
      "Fallback Admin Recovery",
      "Phased Rollout Strategy"
    ]) {
      expect(implementationPlan).toContain(expected);
    }

    for (const expected of [
      "SSO Setup",
      "SCIM Provisioning",
      "Deprovisioning",
      "Lockout And Recovery",
      "Audit Logs",
      "Role And Group Mapping",
      "Security Responsibilities",
      "not currently shipped"
    ]) {
      expect(adminGuide).toContain(expected);
    }

    expect(rbacBoundary).toContain("enterprise/ENTERPRISE_IDENTITY_IMPLEMENTATION_PLAN.md");
    expect(rbacBoundary).toContain("enterprise/ENTERPRISE_ADMIN_IDENTITY_GUIDE.md");
    expect(moduleRegistry).toContain("lib/product/enterprise-identity.ts");
    expect(moduleRegistry).toContain("lib/product/enterprise-identity-runtime.ts");
  });
});
