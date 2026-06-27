import { describe, expect, it } from "vitest";
import {
  buildEnterpriseIdentityAuditLogInput,
  canEnterpriseProvisionedUserAuthenticate,
  evaluateEnterpriseIdentityAdminAccess,
  evaluateEnterpriseProvisionedMemberAccess,
  normalizeEnterpriseGroupRoleMapping,
  normalizeEnterpriseScimMutation,
  sanitizeEnterpriseIdentityAuditMetadata
} from "@/lib/product/enterprise-identity-runtime";
import { ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS } from "@/lib/product/enterprise-identity";

describe("enterprise identity runtime bridge", () => {
  it("requires organization admin or owner, Enterprise plan, active subscription, and explicit feature enablement", () => {
    expect(
      evaluateEnterpriseIdentityAdminAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "operator",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "admin_or_owner_required" });

    expect(
      evaluateEnterpriseIdentityAdminAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "admin",
        planTier: "growth",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "enterprise_plan_required" });

    expect(
      evaluateEnterpriseIdentityAdminAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "admin",
        planTier: "enterprise",
        subscriptionStatus: "cancelled",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "active_subscription_required" });

    expect(
      evaluateEnterpriseIdentityAdminAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "admin",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: false
      })
    ).toMatchObject({ allowed: false, reason: "feature_disabled" });

    expect(
      evaluateEnterpriseIdentityAdminAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "owner",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: true, reason: "allowed", role: "owner" });
  });

  it("makes deprovisioning and lockout authentication behavior explicit", () => {
    expect(canEnterpriseProvisionedUserAuthenticate("active")).toBe(true);
    expect(canEnterpriseProvisionedUserAuthenticate("pending")).toBe(false);
    expect(canEnterpriseProvisionedUserAuthenticate("soft_deprovisioned")).toBe(false);
    expect(canEnterpriseProvisionedUserAuthenticate("hard_deprovisioned")).toBe(false);
    expect(canEnterpriseProvisionedUserAuthenticate("locked")).toBe(false);
  });

  it("denies provisioned member access for pending, deprovisioned, and locked states even when stale membership exists", () => {
    expect(
      evaluateEnterpriseProvisionedMemberAccess({
        organizationId: "org-1",
        userId: "user-1",
        membershipRole: "operator",
        provisioningState: "active"
      })
    ).toMatchObject({ allowed: true, reason: "allowed", role: "operator" });

    expect(
      evaluateEnterpriseProvisionedMemberAccess({
        organizationId: "org-1",
        userId: "user-1",
        membershipRole: "operator",
        provisioningState: "pending"
      })
    ).toMatchObject({ allowed: false, reason: "provisioning_pending" });

    expect(
      evaluateEnterpriseProvisionedMemberAccess({
        organizationId: "org-1",
        userId: "user-1",
        membershipRole: "admin",
        provisioningState: "soft_deprovisioned"
      })
    ).toMatchObject({ allowed: false, reason: "user_deprovisioned" });

    expect(
      evaluateEnterpriseProvisionedMemberAccess({
        organizationId: "org-1",
        userId: "user-1",
        membershipRole: "owner",
        provisioningState: "locked",
        lockoutReason: "security_review"
      })
    ).toMatchObject({
      allowed: false,
      reason: "user_locked",
      lockoutReason: "security_review"
    });

    expect(
      evaluateEnterpriseProvisionedMemberAccess({
        organizationId: "org-1",
        userId: "user-1",
        membershipRole: null,
        provisioningState: "active"
      })
    ).toMatchObject({ allowed: false, reason: "missing_membership_role" });
  });

  it("normalizes SCIM create, update, deprovision, lockout, and recovery into tenant-scoped safe state", () => {
    const created = normalizeEnterpriseScimMutation({
      organizationId: "org-1",
      operation: "create",
      externalId: "ProviderExternalUser123",
      email: "person@example.com",
      targetUserId: "user-1",
      requestedRole: "operator"
    });

    expect(created).toMatchObject({
      organizationId: "org-1",
      targetUserId: "user-1",
      provisioningState: "active",
      role: "operator",
      reasonCode: "scim_normalized"
    });
    expect(created.externalIdHash).not.toContain("ProviderExternalUser123");
    expect(created.emailHash).not.toContain("person@example.com");

    expect(
      normalizeEnterpriseScimMutation({
        organizationId: "org-1",
        operation: "delete",
        externalId: "ProviderExternalUser123",
        requestedRole: "operator"
      }).provisioningState
    ).toBe("soft_deprovisioned");
    expect(
      normalizeEnterpriseScimMutation({
        organizationId: "org-1",
        operation: "lock",
        externalId: "ProviderExternalUser123"
      }).provisioningState
    ).toBe("locked");
    expect(
      normalizeEnterpriseScimMutation({
        organizationId: "org-1",
        operation: "recover",
        externalId: "ProviderExternalUser123"
      }).provisioningState
    ).toBe("active");
  });

  it("prevents group-role mappings from escalating to owner, internal, or future enterprise roles", () => {
    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "saml_2_0",
        groupId: "Renewal Operators",
        requestedRole: "operator"
      })
    ).toMatchObject({ allowed: true, normalizedRole: "operator", reasonCode: "allowed" });

    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "saml_2_0",
        groupId: "Admins",
        requestedRole: "admin"
      })
    ).toMatchObject({ allowed: false, normalizedRole: "admin", reasonCode: "future_role_forbidden" });

    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "saml_2_0",
        groupId: "Owners",
        requestedRole: "owner"
      })
    ).toMatchObject({ allowed: false, normalizedRole: "owner", reasonCode: "owner_mapping_forbidden" });

    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "oidc",
        groupId: "Security Admins",
        requestedRole: "security_admin"
      })
    ).toMatchObject({ allowed: false, normalizedRole: null, reasonCode: "future_role_forbidden" });

    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "scim_2_0",
        groupId: "Internal",
        requestedRole: "internal_admin"
      })
    ).toMatchObject({ allowed: false, normalizedRole: null, reasonCode: "future_role_forbidden" });
  });

  it("builds safe identity audit inputs and strips raw provider, token, assertion, secret, and SCIM payload fields", () => {
    const metadata = sanitizeEnterpriseIdentityAuditMetadata("enterprise.scim_user_provisioned", {
      request_id: "req-1",
      provider: "scim_2_0",
      target_user_id: "user-1",
      scim_user_id: "scim-user-1",
      role: "operator",
      reason_code: "scim_normalized",
      raw_idp_assertion: "RAW_ASSERTION_MARKER",
      saml_response: "SAML_RESPONSE_MARKER",
      id_token: "OIDC_TOKEN_MARKER",
      access_token: "ACCESS_TOKEN_MARKER",
      client_secret: "CLIENT_SECRET_MARKER",
      scim_payload: "SCIM_PAYLOAD_MARKER",
      provider_payload: "PROVIDER_PAYLOAD_MARKER",
      initiated_by: {
        target_user_id: "user-1",
        token: "NESTED_TOKEN_MARKER",
        nested: {
          provider_payload: "NESTED_PROVIDER_PAYLOAD_MARKER",
          reason_code: "safe_nested_reason"
        }
      },
      recovery_method: [
        "approved_admin_recovery",
        "raw SAML assertion SENSITIVE_ASSERTION_MARKER"
      ]
    });

    expect(metadata).toEqual({
      request_id: "req-1",
      provider: "scim_2_0",
      target_user_id: "user-1",
      scim_user_id: "scim-user-1",
      role: "operator",
      reason_code: "scim_normalized",
      initiated_by: {
        target_user_id: "user-1",
        nested: {
          reason_code: "safe_nested_reason"
        }
      },
      recovery_method: ["approved_admin_recovery"]
    });

    const auditInput = buildEnterpriseIdentityAuditLogInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      eventName: "enterprise.scim_user_provisioned",
      entityId: "user-1",
      metadata
    });

    expect(auditInput).toMatchObject({
      organizationId: "org-1",
      actorUserId: "admin-1",
      action: "enterprise.scim_user_provisioned",
      entityType: "enterprise_identity",
      entityId: "user-1"
    });

    const rendered = JSON.stringify(auditInput);
    for (const forbidden of [
      "RAW_ASSERTION_MARKER",
      "SAML_RESPONSE_MARKER",
      "OIDC_TOKEN_MARKER",
      "ACCESS_TOKEN_MARKER",
      "CLIENT_SECRET_MARKER",
      "SCIM_PAYLOAD_MARKER",
      "PROVIDER_PAYLOAD_MARKER",
      "NESTED_TOKEN_MARKER",
      "NESTED_PROVIDER_PAYLOAD_MARKER",
      "SENSITIVE_ASSERTION_MARKER"
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it("keeps every identity audit contract future-only while enabling safe audit shaping", () => {
    for (const contract of Object.values(ENTERPRISE_IDENTITY_AUDIT_EVENT_CONTRACTS)) {
      expect(contract.status).toBe("future");
      expect(contract.requiredPlanOrGate).toBe("enterprise");
      expect(contract.allowedSafeMetadataKeys).toContain("request_id");
      expect(contract.forbiddenMetadataKeys).toEqual(
        expect.arrayContaining(["saml_response", "id_token", "access_token", "scim_payload", "provider_payload"])
      );
    }
  });
});
