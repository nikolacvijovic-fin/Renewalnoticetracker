import { describe, expect, it } from "vitest";
import {
  buildEnterpriseBreakGlassAuditLogInput,
  buildEnterpriseIdentityAuditInput,
  buildEnterpriseGroupRoleMappingAuditLogInput,
  buildEnterpriseIdentityAuditLogInput,
  buildEnterpriseSsoConfigurationAuditLogInput,
  canEnterpriseProvisionedUserAuthenticate,
  authenticateEnterpriseScimBearerToken,
  evaluateBreakGlassAdminPolicy,
  evaluateEnterpriseIdentityAccess,
  evaluateEnterpriseIdentityAdminAccess,
  evaluateEnterpriseBreakGlassPreservation,
  evaluateEnterpriseMemberAccess,
  evaluateEnterpriseProvisionedMemberAccess,
  evaluateEnterpriseSsoLoginCallback,
  evaluateEnterpriseSsoConfigurationReadiness,
  normalizeEnterpriseGroupRoleMapping,
  normalizeEnterpriseScimMutation,
  prepareEnterpriseIdentityConfigChange,
  prepareEnterpriseIdentitySessionRevocationIntent,
  prepareEnterpriseScimEndpointResponse,
  prepareScimProvisioningDecision,
  prepareEnterpriseScimMutationDecision,
  resolveSafeGroupRoleMapping,
  sanitizeEnterpriseIdentityMetadata,
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

  it("normalizes SSO configuration readiness without enabling current login behavior", () => {
    expect(
      evaluateEnterpriseSsoConfigurationReadiness({
        organizationId: "org-1",
        configurationOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        provider: "saml_2_0",
        status: "active",
        metadataFingerprint: "metadata-fingerprint",
        certificateFingerprint: "certificate-fingerprint",
        certificateExpiresAt: "2099-01-01T00:00:00.000Z",
        domainVerified: true
      })
    ).toMatchObject({
      allowed: true,
      readyForFutureLogin: true,
      canAffectCurrentLogin: false,
      missingRequirements: []
    });

    expect(
      evaluateEnterpriseSsoConfigurationReadiness({
        organizationId: "org-1",
        configurationOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        provider: "oidc",
        status: "draft",
        domainVerified: false
      })
    ).toMatchObject({
      allowed: true,
      status: "draft",
      readyForFutureLogin: false,
      canAffectCurrentLogin: false,
      missingRequirements: expect.arrayContaining([
        "metadata_fingerprint_required",
        "certificate_fingerprint_required",
        "domain_verification_required"
      ])
    });

    expect(
      evaluateEnterpriseSsoConfigurationReadiness({
        organizationId: "org-1",
        configurationOrganizationId: "org-2",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        provider: "saml_2_0",
        status: "configured"
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });
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
        operation: "create",
        externalId: "ProviderExternalUser123",
        requestedRole: "admin"
      })
    ).toMatchObject({
      role: null,
      reasonCode: "admin_mapping_policy_required"
    });
    expect(
      normalizeEnterpriseScimMutation({
        organizationId: "org-1",
        operation: "create",
        externalId: "ProviderExternalUser123",
        requestedRole: "admin",
        roleMappingPolicy: { allowAdminGroupMapping: true }
      })
    ).toMatchObject({
      role: "admin",
      reasonCode: "scim_normalized"
    });

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

  it("prepares SCIM mutation decisions with Enterprise gating, tenant scope, and safe audit evidence", () => {
    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "growth",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "ProviderExternalUser123",
          email: "person@example.com",
          targetUserId: "user-1",
          requestedRole: "operator"
        }
      })
    ).toMatchObject({ allowed: false, reason: "enterprise_plan_required" });

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-2",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        mutation: {
          organizationId: "org-2",
          operation: "create",
          externalId: "ProviderExternalUser123",
          targetUserId: "user-1",
          requestedRole: "operator"
        }
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });

    const decision = prepareEnterpriseScimMutationDecision({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      targetCurrentRole: "operator",
      activeAdminOrOwnerCount: 2,
      breakGlassRecoveryActive: true,
      mutation: {
        organizationId: "org-1",
        operation: "update",
        externalId: "ProviderExternalUser123",
        email: "person@example.com",
        targetUserId: "user-1",
        requestedRole: "reviewer"
      }
    });

    expect(decision).toMatchObject({
      allowed: true,
      mapping: {
        organizationId: "org-1",
        targetUserId: "user-1",
        provisioningState: "active",
        role: "reviewer"
      },
      audit: {
        organizationId: "org-1",
        action: "enterprise.scim_user_updated",
        details: {
          provider: "scim_2_0",
          target_user_id: "user-1",
          previous_state: "update",
          new_state: "active",
          role: "reviewer",
          reason_code: "scim_normalized",
          initiated_by: "scim_directory"
        }
      }
    });

    expect(JSON.stringify(decision)).not.toContain("ProviderExternalUser123");
    expect(JSON.stringify(decision)).not.toContain("person@example.com");

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        targetCurrentRole: "operator",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: true,
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "ProviderExternalUser123",
          targetUserId: "user-2",
          requestedRole: "owner"
        }
      })
    ).toMatchObject({ allowed: false, reason: "owner_mapping_forbidden" });

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        targetCurrentRole: "operator",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: true,
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "ProviderExternalUser123",
          targetUserId: "user-2",
          requestedRole: "admin"
        }
      })
    ).toMatchObject({ allowed: false, reason: "admin_mapping_policy_required" });

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        targetCurrentRole: "operator",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: true,
        roleMappingPolicy: { allowAdminGroupMapping: true },
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "ProviderExternalUser123",
          targetUserId: "user-2",
          requestedRole: "admin"
        }
      })
    ).toMatchObject({
      allowed: true,
      mapping: {
        role: "admin",
        reasonCode: "scim_normalized"
      }
    });

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        targetCurrentRole: "operator",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: true,
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "ProviderExternalUser123",
          targetUserId: "user-2",
          requestedRole: "security_admin"
        }
      })
    ).toMatchObject({ allowed: false, reason: "future_role_forbidden" });
  });

  it("blocks privileged deprovisioning unless break-glass admin preservation remains intact", () => {
    expect(
      evaluateEnterpriseBreakGlassPreservation({
        organizationId: "org-1",
        targetUserId: "admin-1",
        targetRole: "admin",
        operation: "delete",
        activeAdminOrOwnerCount: 1,
        breakGlassRecoveryActive: true
      })
    ).toMatchObject({ allowed: false, reason: "last_admin_or_owner_required" });

    expect(
      evaluateEnterpriseBreakGlassPreservation({
        organizationId: "org-1",
        targetUserId: "admin-1",
        targetRole: "admin",
        operation: "lock",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: false
      })
    ).toMatchObject({ allowed: false, reason: "break_glass_recovery_required" });

    expect(
      prepareEnterpriseScimMutationDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        targetCurrentRole: "owner",
        activeAdminOrOwnerCount: 2,
        breakGlassRecoveryActive: true,
        mutation: {
          organizationId: "org-1",
          operation: "lock",
          externalId: "OwnerExternalId",
          targetUserId: "owner-1",
          requestedRole: "operator"
        }
      })
    ).toMatchObject({
      allowed: true,
      mapping: {
        organizationId: "org-1",
        targetUserId: "owner-1",
        provisioningState: "locked"
      },
      audit: {
        action: "enterprise.identity_member_locked"
      }
    });
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
    ).toMatchObject({ allowed: false, normalizedRole: "admin", reasonCode: "admin_mapping_policy_required" });

    expect(
      normalizeEnterpriseGroupRoleMapping({
        organizationId: "org-1",
        provider: "saml_2_0",
        groupId: "Admins",
        requestedRole: "admin",
        policy: { allowAdminGroupMapping: true }
      })
    ).toMatchObject({ allowed: true, normalizedRole: "admin", reasonCode: "allowed" });

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

  it("keeps both SCIM decision paths on the same safe role-mapping policy", () => {
    const baseProvisioning = {
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      operation: "provision" as const,
      externalId: "external-user-1",
      targetUserId: "user-1"
    };
    const baseMutation = {
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      targetCurrentRole: "operator",
      activeAdminOrOwnerCount: 2,
      breakGlassRecoveryActive: true
    };

    for (const requestedRole of ["owner", "admin", "security_admin", "operator", "reviewer"] as const) {
      const provisioningDecision = prepareScimProvisioningDecision({
        ...baseProvisioning,
        requestedRole
      });
      const mutationDecision = prepareEnterpriseScimMutationDecision({
        ...baseMutation,
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "external-user-1",
          targetUserId: "user-1",
          requestedRole
        }
      });

      expect(provisioningDecision.allowed, requestedRole).toBe(mutationDecision.allowed);
      if (!provisioningDecision.allowed || !mutationDecision.allowed) {
        expect(provisioningDecision).toMatchObject({ reason: mutationDecision.reason });
      }
    }

    expect(
      prepareScimProvisioningDecision({
        ...baseProvisioning,
        requestedRole: "admin",
        roleMappingPolicy: { allowAdminGroupMapping: true }
      })
    ).toMatchObject({ allowed: true, role: "admin" });

    expect(
      prepareEnterpriseScimMutationDecision({
        ...baseMutation,
        roleMappingPolicy: { allowAdminGroupMapping: true },
        mutation: {
          organizationId: "org-1",
          operation: "create",
          externalId: "external-user-1",
          targetUserId: "user-1",
          requestedRole: "admin"
        }
      })
    ).toMatchObject({ allowed: true, mapping: { role: "admin" } });
  });

  it("builds precise future-only audit evidence for SSO config, group mapping, and break-glass outcomes", () => {
    const ssoConfigured = buildEnterpriseSsoConfigurationAuditLogInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      configurationId: "sso-config-1",
      provider: "saml_2_0",
      newStatus: "configured",
      reasonCode: "metadata_uploaded",
      metadataFingerprint: "metadata-fingerprint",
      certificateFingerprint: "certificate-fingerprint",
      certificateExpiresAt: "2099-01-01T00:00:00.000Z"
    });

    expect(ssoConfigured).toMatchObject({
      action: "enterprise.identity_provider_configured",
      entityId: "sso-config-1",
      details: {
        sso_configuration_id: "sso-config-1",
        provider: "saml_2_0",
        new_state: "configured",
        reason_code: "metadata_uploaded",
        metadata_fingerprint: "metadata-fingerprint",
        certificate_fingerprint: "certificate-fingerprint"
      }
    });

    const ssoChanged = buildEnterpriseSsoConfigurationAuditLogInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      configurationId: "sso-config-1",
      provider: "oidc",
      previousStatus: "configured",
      newStatus: "disabled",
      reasonCode: "customer_disabled"
    });

    expect(ssoChanged).toMatchObject({
      action: "enterprise.sso_config_changed",
      details: {
        provider: "oidc",
        previous_state: "configured",
        new_state: "disabled",
        reason_code: "customer_disabled"
      }
    });

    const groupMapping = normalizeEnterpriseGroupRoleMapping({
      organizationId: "org-1",
      provider: "oidc",
      groupId: "Renewal Reviewers",
      requestedRole: "reviewer"
    });
    const mappingAudit = buildEnterpriseGroupRoleMappingAuditLogInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      mappingId: "mapping-1",
      mapping: groupMapping
    });

    expect(mappingAudit).toMatchObject({
      action: "enterprise.role_group_mapping_changed",
      details: {
        mapping_id: "mapping-1",
        provider: "oidc",
        group_id_hash: groupMapping.groupIdHash,
        role: "reviewer",
        reason_code: "allowed"
      }
    });
    expect(JSON.stringify(mappingAudit)).not.toContain("Renewal Reviewers");

    expect(
      buildEnterpriseBreakGlassAuditLogInput({
        organizationId: "org-1",
        actorUserId: "system",
        targetUserId: "admin-1",
        preserved: true,
        activeAdminOrOwnerCount: 2,
        reasonCode: "secondary_admin_present"
      })
    ).toMatchObject({
      action: "enterprise.break_glass_admin_preserved",
      details: {
        target_user_id: "admin-1",
        outcome: "preserved",
        active_admin_owner_count: 2,
        reason_code: "secondary_admin_present"
      }
    });

    expect(
      buildEnterpriseBreakGlassAuditLogInput({
        organizationId: "org-1",
        actorUserId: "system",
        targetUserId: "admin-1",
        preserved: false,
        activeAdminOrOwnerCount: 1,
        blockedReason: "last_admin_or_owner_required"
      })
    ).toMatchObject({
      action: "enterprise.break_glass_admin_blocked",
      details: {
        target_user_id: "admin-1",
        outcome: "blocked",
        active_admin_owner_count: 1,
        blocked_reason: "last_admin_or_owner_required"
      }
    });
  });

  it("enforces the canonical SSO/SCIM runtime helper contract without provider-backed login endpoints", () => {
    expect(
      evaluateEnterpriseIdentityAccess({
        organizationId: "org-1",
        actorUserId: "admin-1",
        role: "admin",
        planTier: "enterprise",
        subscriptionStatus: "trialing",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: true, reason: "allowed", role: "admin" });

    expect(
      evaluateEnterpriseIdentityAccess({
        organizationId: "org-1",
        actorUserId: "reviewer-1",
        role: "reviewer",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "admin_or_owner_required" });

    expect(
      prepareEnterpriseIdentityConfigChange({
        organizationId: "org-1",
        configurationOrganizationId: "org-2",
        actorUserId: "admin-1",
        role: "admin",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        providerType: "saml",
        nextStatus: "configured",
        configurationId: "sso-config-1"
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });

    const configChange = prepareEnterpriseIdentityConfigChange({
      organizationId: "org-1",
      configurationOrganizationId: "org-1",
      actorUserId: "owner-1",
      role: "owner",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      providerType: "oidc",
      previousStatus: "draft",
      nextStatus: "configured",
      configurationId: "sso-config-1",
      reasonCode: "metadata_validated",
      metadata: {
        provider_payload: "RAW_PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
        id_token: "OIDC_ID_TOKEN_SHOULD_NOT_SURVIVE"
      }
    });

    expect(configChange).toMatchObject({
      allowed: true,
      audit: {
        action: "identity.sso_config_changed",
        details: {
          sso_configuration_id: "sso-config-1",
          provider: "oidc",
          previous_state: "draft",
          new_state: "configured",
          reason_code: "metadata_validated"
        }
      }
    });
    expect(JSON.stringify(configChange)).not.toContain("RAW_PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE");
    expect(JSON.stringify(configChange)).not.toContain("OIDC_ID_TOKEN_SHOULD_NOT_SURVIVE");

    expect(
      evaluateEnterpriseMemberAccess({
        organizationId: "org-1",
        userId: "user-locked",
        membershipRole: "owner",
        memberStatus: "locked",
        lockoutReason: "security_review"
      })
    ).toMatchObject({ allowed: false, reason: "member_locked" });

    expect(
      evaluateEnterpriseMemberAccess({
        organizationId: "org-1",
        userId: "user-deprovisioned",
        membershipRole: "admin",
        memberStatus: "deprovisioned"
      })
    ).toMatchObject({ allowed: false, reason: "member_deprovisioned" });
  });

  it("keeps SCIM provisioning decisions tenant-scoped and role mappings non-escalating by default", () => {
    expect(
      resolveSafeGroupRoleMapping({
        organizationId: "org-1",
        providerType: "oidc",
        groupId: "Owners",
        requestedRole: "owner"
      })
    ).toMatchObject({ allowed: false, reasonCode: "owner_mapping_forbidden" });

    expect(
      resolveSafeGroupRoleMapping({
        organizationId: "org-1",
        providerType: "oidc",
        groupId: "Admins",
        requestedRole: "admin"
      })
    ).toMatchObject({ allowed: false, reasonCode: "admin_mapping_policy_required" });

    expect(
      resolveSafeGroupRoleMapping({
        organizationId: "org-1",
        providerType: "oidc",
        groupId: "Admins",
        requestedRole: "admin",
        policy: { allowAdminGroupMapping: true }
      })
    ).toMatchObject({ allowed: true, normalizedRole: "admin" });

    expect(
      prepareScimProvisioningDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-2",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        operation: "provision",
        externalId: "external-user-1",
        requestedRole: "reviewer"
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });

    expect(
      prepareScimProvisioningDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        operation: "update",
        externalId: "external-user-1",
        requestedRole: "owner"
      })
    ).toMatchObject({ allowed: false, reason: "owner_mapping_forbidden" });

    const provision = prepareScimProvisioningDecision({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      operation: "provision",
      externalId: "external-user-1",
      email: "person@example.com",
      targetUserId: "user-1",
      requestedRole: "admin",
      roleMappingPolicy: { allowAdminGroupMapping: true },
      rawProviderPayload: {
        scim_bearer_token: "SCIM_BEARER_TOKEN_SHOULD_NOT_SURVIVE",
        raw_group_payload: "RAW_GROUP_PAYLOAD_SHOULD_NOT_SURVIVE"
      }
    });

    expect(provision).toMatchObject({
      allowed: true,
      role: "admin",
      memberStatus: "active",
      audit: {
        action: "identity.scim_user_provisioned",
        details: {
          provider: "scim",
          target_user_id: "user-1",
          new_state: "active",
          role: "admin",
          initiated_by: "scim_directory"
        }
      }
    });
    expect(JSON.stringify(provision)).not.toContain("person@example.com");
    expect(JSON.stringify(provision)).not.toContain("SCIM_BEARER_TOKEN_SHOULD_NOT_SURVIVE");
    expect(JSON.stringify(provision)).not.toContain("RAW_GROUP_PAYLOAD_SHOULD_NOT_SURVIVE");
  });

  it("prepares future SCIM endpoint responses without logging raw bearer tokens or bypassing role policy", () => {
    const expectedFingerprint =
      "dfe503eb11052e879c4473695b319e59476e1c53bacb2b81d55f6f78257ec2b1";
    const scimAuth = authenticateEnterpriseScimBearerToken({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      directoryStatus: "active",
      presentedBearerToken: "future-scim-token",
      expectedBearerTokenFingerprint: expectedFingerprint
    });

    expect(scimAuth).toMatchObject({
      authenticated: true,
      reason: "allowed",
      tokenFingerprint: expectedFingerprint
    });
    expect(JSON.stringify(scimAuth)).not.toContain("future-scim-token");

    expect(
      authenticateEnterpriseScimBearerToken({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        directoryStatus: "active",
        presentedBearerToken: "wrong-token",
        expectedBearerTokenFingerprint: expectedFingerprint
      })
    ).toMatchObject({ authenticated: false, reason: "invalid_bearer_token" });

    const denied = prepareEnterpriseScimEndpointResponse({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      scimAuth,
      operation: "provision",
      externalId: "external-user-1",
      email: "person@example.com",
      targetUserId: "user-1",
      requestedRole: "owner"
    });

    expect(denied).toMatchObject({
      ok: false,
      status: 403,
      code: "scim_forbidden",
      reason: "owner_mapping_forbidden"
    });
    expect(JSON.stringify(denied)).not.toContain("person@example.com");

    const allowed = prepareEnterpriseScimEndpointResponse({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      scimAuth,
      operation: "provision",
      externalId: "external-user-1",
      email: "person@example.com",
      targetUserId: "user-1",
      requestedRole: "admin",
      roleMappingPolicy: { allowAdminGroupMapping: true }
    });

    expect(allowed).toMatchObject({
      ok: true,
      status: 201,
      code: "scim_provisioning_prepared",
      body: {
        targetUserId: "user-1",
        memberStatus: "active",
        role: "admin"
      },
      audit: {
        action: "identity.scim_user_provisioned"
      }
    });
    expect(JSON.stringify(allowed)).not.toContain("person@example.com");
    expect(JSON.stringify(allowed)).not.toContain("external-user-1");
  });

  it("evaluates future SSO callbacks from verified results without enabling current login", () => {
    const callback = evaluateEnterpriseSsoLoginCallback({
      organizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      expectedDomain: "example.com",
      providerConfiguration: {
        organizationId: "org-1",
        configurationId: "sso-config-1",
        providerType: "saml",
        status: "active",
        entityId: "https://idp.example.com",
        ssoUrl: "https://idp.example.com/sso",
        metadataFingerprint: "metadata-fingerprint",
        certificateFingerprint: "certificate-fingerprint",
        domain: "example.com"
      },
      verification: {
        verified: true,
        providerType: "saml",
        organizationId: "org-1",
        configurationOrganizationId: "org-1",
        domain: "example.com",
        externalId: "external-user-1",
        email: "person@example.com",
        targetUserId: "user-1",
        reasonCode: "assertion_verified",
        rawProviderPayload: "RAW_SAML_ASSERTION_SHOULD_NOT_SURVIVE",
        safeMetadata: {
          provider_payload: "PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
          reason_code: "safe_callback_reason"
        }
      },
      membershipRole: "operator",
      memberStatus: "active"
    });

    expect(callback).toMatchObject({
      allowed: true,
      canAffectCurrentLogin: false,
      targetUserId: "user-1",
      audit: {
        action: "identity.sso_callback_prepared",
        details: {
          provider: "saml",
          target_user_id: "user-1",
          external_id_hash: callback.allowed ? callback.externalIdHash : undefined,
          email_hash: callback.allowed ? callback.emailHash : undefined,
          new_state: "verified_callback_prepared",
          reason_code: "safe_callback_reason"
        }
      }
    });
    expect(JSON.stringify(callback)).not.toContain("person@example.com");
    expect(JSON.stringify(callback)).not.toContain("external-user-1");
    expect(JSON.stringify(callback)).not.toContain("RAW_SAML_ASSERTION_SHOULD_NOT_SURVIVE");
    expect(JSON.stringify(callback)).not.toContain("PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE");

    expect(
      evaluateEnterpriseSsoLoginCallback({
        organizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        expectedDomain: "example.com",
        providerConfiguration: {
          organizationId: "org-1",
          configurationId: "sso-config-1",
          providerType: "oidc",
          status: "active",
          issuer: "https://idp.example.com",
          clientIdHash: "client-id-hash",
          jwksFingerprint: "jwks-fingerprint",
          domain: "example.com"
        },
        verification: {
          verified: true,
          providerType: "oidc",
          organizationId: "org-1",
          configurationOrganizationId: "org-1",
          domain: "example.com",
          targetUserId: "user-locked"
        },
        membershipRole: "owner",
        memberStatus: "locked"
      })
    ).toMatchObject({
      allowed: false,
      reason: "member_locked",
      canAffectCurrentLogin: false
    });
  });

  it("creates a future session revocation intent for lock and deprovision decisions without claiming current session revocation", () => {
    const deprovisionDecision = prepareEnterpriseScimMutationDecision({
      organizationId: "org-1",
      directoryOrganizationId: "org-1",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseIdentityEnabled: true,
      targetCurrentRole: "operator",
      activeAdminOrOwnerCount: 2,
      breakGlassRecoveryActive: true,
      mutation: {
        organizationId: "org-1",
        operation: "delete",
        externalId: "external-user-1",
        targetUserId: "user-1",
        requestedRole: "operator"
      }
    });

    expect(deprovisionDecision).toMatchObject({
      allowed: true,
      mapping: { provisioningState: "soft_deprovisioned" },
      sessionRevocationIntent: {
        planned: true,
        canAffectCurrentSessions: false,
        reasonCode: "member_deprovisioned",
        audit: {
          action: "enterprise.scim_user_deprovisioned",
          details: {
            target_user_id: "user-1",
            new_state: "soft_deprovisioned",
            session_revocation_intent: "planned",
            can_affect_current_sessions: false
          }
        }
      }
    });

    const lockIntent = prepareEnterpriseIdentitySessionRevocationIntent({
      organizationId: "org-1",
      userId: "user-locked",
      reasonCode: "member_locked",
      actorUserId: "system"
    });

    expect(lockIntent).toMatchObject({
      planned: true,
      canAffectCurrentSessions: false,
      reasonCode: "member_locked",
      audit: {
        action: "enterprise.identity_member_locked",
        details: {
          target_user_id: "user-locked",
          new_state: "locked",
          session_revocation_intent: "planned",
          can_affect_current_sessions: false
        }
      }
    });
  });

  it("preserves break-glass admin safety before privileged SCIM changes", () => {
    expect(
      evaluateBreakGlassAdminPolicy({
        organizationId: "org-1",
        targetUserId: "owner-1",
        targetRole: "owner",
        operation: "deprovision",
        policy: {
          activeAdminOrOwnerCount: 1,
          nonScimAdminOrOwnerCount: 0
        }
      })
    ).toMatchObject({
      allowed: false,
      reason: "last_admin_or_owner_required",
      audit: { action: "identity.break_glass_policy_checked" }
    });

    expect(
      evaluateBreakGlassAdminPolicy({
        organizationId: "org-1",
        targetUserId: "admin-1",
        targetRole: "admin",
        operation: "lock",
        policy: {
          activeAdminOrOwnerCount: 2,
          nonScimAdminOrOwnerCount: 0
        }
      })
    ).toMatchObject({ allowed: false, reason: "non_scim_break_glass_required" });

    expect(
      evaluateBreakGlassAdminPolicy({
        organizationId: "org-1",
        targetUserId: "admin-1",
        targetRole: "admin",
        operation: "lock",
        policy: {
          activeAdminOrOwnerCount: 2,
          nonScimAdminOrOwnerCount: 1
        }
      })
    ).toMatchObject({ allowed: true, preservedBy: "non_scim_admin_or_owner" });

    expect(
      prepareScimProvisioningDecision({
        organizationId: "org-1",
        directoryOrganizationId: "org-1",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseIdentityEnabled: true,
        operation: "deprovision",
        targetUserId: "owner-1",
        currentRole: "owner",
        breakGlassPolicy: {
          activeAdminOrOwnerCount: 1,
          nonScimAdminOrOwnerCount: 0
        }
      })
    ).toMatchObject({ allowed: false, reason: "last_admin_or_owner_required" });
  });

  it("recursively strips sensitive identity metadata from canonical audit helpers", () => {
    const metadata = sanitizeEnterpriseIdentityMetadata(
      {
        provider: "saml",
        reason_code: "metadata_uploaded",
        provider_payload: "PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE",
        nested: {
          access_token: "ACCESS_TOKEN_SHOULD_NOT_SURVIVE",
          raw_profile_payload: "RAW_PROFILE_SHOULD_NOT_SURVIVE"
        },
        list: [
          { scim_bearer_token: "SCIM_BEARER_SHOULD_NOT_SURVIVE" },
          "safe_reason_code"
        ]
      },
      "identity.sso_config_changed"
    );

    expect(metadata).toEqual({
      provider: "saml",
      reason_code: "metadata_uploaded"
    });
    expect(JSON.stringify(metadata)).not.toContain("PROVIDER_PAYLOAD_SHOULD_NOT_SURVIVE");
    expect(JSON.stringify(metadata)).not.toContain("ACCESS_TOKEN_SHOULD_NOT_SURVIVE");
    expect(JSON.stringify(metadata)).not.toContain("RAW_PROFILE_SHOULD_NOT_SURVIVE");

    const audit = buildEnterpriseIdentityAuditInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      eventName: "identity.group_role_mapping_changed",
      entityId: "mapping-1",
      metadata: {
        mapping_id: "mapping-1",
        provider: "oidc",
        group_id_hash: "hashed-group",
        role: "reviewer",
        group_payload: "GROUP_PAYLOAD_SHOULD_NOT_SURVIVE"
      }
    });

    expect(audit).toMatchObject({
      action: "identity.group_role_mapping_changed",
      details: {
        mapping_id: "mapping-1",
        provider: "oidc",
        group_id_hash: "hashed-group",
        role: "reviewer"
      }
    });
    expect(JSON.stringify(audit)).not.toContain("GROUP_PAYLOAD_SHOULD_NOT_SURVIVE");
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
