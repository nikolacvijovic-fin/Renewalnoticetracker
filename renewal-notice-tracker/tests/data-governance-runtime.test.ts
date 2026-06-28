import { describe, expect, it } from "vitest";
import {
  buildGovernanceAuditLogInput,
  buildSupportAccessDiagnostic,
  evaluateRetentionPolicyChangeAccess,
  normalizeGovernanceLifecycleState,
  prepareSupportAccessReview,
  prepareRetentionPolicyChange,
  sanitizeGovernanceMetadata
} from "@/lib/product/data-governance-runtime";

describe("data governance runtime controls", () => {
  it("requires admin or owner authority plus an enabled Enterprise governance gate for retention policy changes", () => {
    expect(
      evaluateRetentionPolicyChangeAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "operator",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseGovernanceEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "admin_or_owner_required" });

    expect(
      evaluateRetentionPolicyChangeAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "admin",
        planTier: "growth",
        subscriptionStatus: "active",
        enterpriseGovernanceEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "enterprise_plan_required" });

    expect(
      evaluateRetentionPolicyChangeAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "owner",
        planTier: "enterprise",
        subscriptionStatus: "cancelled",
        enterpriseGovernanceEnabled: true
      })
    ).toMatchObject({ allowed: false, reason: "active_subscription_required" });

    expect(
      evaluateRetentionPolicyChangeAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "admin",
        planTier: "enterprise",
        subscriptionStatus: "active",
        enterpriseGovernanceEnabled: false
      })
    ).toMatchObject({ allowed: false, reason: "feature_disabled" });

    expect(
      evaluateRetentionPolicyChangeAccess({
        organizationId: "org-1",
        actorUserId: "user-1",
        role: "owner",
        planTier: "enterprise",
        subscriptionStatus: "trialing",
        enterpriseGovernanceEnabled: true
      })
    ).toMatchObject({ allowed: true, reason: "allowed", role: "owner" });
  });

  it("prepares organization-scoped retention policy changes without enabling automatic deletion", () => {
    const result = prepareRetentionPolicyChange({
      organizationId: "org-1",
      policyOrganizationId: "org-1",
      actorUserId: "admin-1",
      role: "admin",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseGovernanceEnabled: true,
      policyId: "policy-1",
      objectClass: "contract_notes",
      retentionWindowDays: 365,
      behavior: "delete_after_window_requires_review",
      status: "active",
      reasonCode: "customer_policy_review"
    });

    expect(result).toMatchObject({
      allowed: true,
      policy: {
        policyId: "policy-1",
        organizationId: "org-1",
        objectClass: "contract_notes",
        retentionWindowDays: 365,
        behavior: "delete_after_window_requires_review",
        status: "active",
        deletionRequiresExplicitReview: true,
        automaticDeletionAllowed: false,
        reasonCode: "customer_policy_review"
      },
      audit: {
        organizationId: "org-1",
        actorUserId: "admin-1",
        action: "governance.retention_policy_changed",
        entityType: "governance",
        entityId: "policy-1",
        details: {
          organization_id: "org-1",
          actor_user_id: "admin-1",
          policy_id: "policy-1",
          object_class: "contract_notes",
          retention_window: "365_days",
          status: "active",
          reason_code: "customer_policy_review"
        }
      }
    });
  });

  it("rejects retention policy changes that cross org scope or exceed the supported MVP envelope", () => {
    const base = {
      organizationId: "org-1",
      policyOrganizationId: "org-1",
      actorUserId: "admin-1",
      role: "admin",
      planTier: "enterprise",
      subscriptionStatus: "active",
      enterpriseGovernanceEnabled: true,
      policyId: "policy-1",
      objectClass: "contract_metadata",
      retentionWindowDays: 365,
      behavior: "minimize_after_window",
      status: "active"
    } as const;

    expect(
      prepareRetentionPolicyChange({
        ...base,
        policyOrganizationId: "org-2"
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });

    expect(
      prepareRetentionPolicyChange({
        ...base,
        objectClass: "not_governed"
      })
    ).toMatchObject({ allowed: false, reason: "unsupported_object_class" });

    expect(
      prepareRetentionPolicyChange({
        ...base,
        retentionWindowDays: 0
      })
    ).toMatchObject({ allowed: false, reason: "invalid_retention_window" });

    expect(
      prepareRetentionPolicyChange({
        ...base,
        retentionWindowDays: 3651
      })
    ).toMatchObject({ allowed: false, reason: "invalid_retention_window" });

    expect(
      prepareRetentionPolicyChange({
        ...base,
        behavior: "delete_automatically"
      })
    ).toMatchObject({ allowed: false, reason: "unsupported_retention_behavior" });

    expect(
      prepareRetentionPolicyChange({
        ...base,
        status: "silently_enforced"
      })
    ).toMatchObject({ allowed: false, reason: "unsupported_policy_status" });
  });

  it("keeps queued, processing, completed, failed, cancelled, and expired states distinct", () => {
    expect(
      normalizeGovernanceLifecycleState({
        kind: "contract_export",
        id: "export-1",
        organizationId: "org-1",
        status: "queued"
      })
    ).toMatchObject({
      status: "queued",
      terminal: false,
      successful: false,
      failed: false,
      downloadable: false
    });

    expect(
      normalizeGovernanceLifecycleState({
        kind: "contract_export",
        id: "export-1",
        organizationId: "org-1",
        status: "completed",
        completedAt: "2026-06-01T00:00:00.000Z",
        artifactStorage: "stored",
        expiresAt: "2099-01-01T00:00:00.000Z",
        downloadAvailable: true
      })
    ).toMatchObject({
      status: "completed",
      terminal: true,
      successful: true,
      failed: false,
      downloadable: true,
      evidenceComplete: true,
      reasonCode: "completed"
    });

    expect(
      normalizeGovernanceLifecycleState({
        kind: "workspace_deletion",
        id: "deletion-1",
        organizationId: "org-1",
        status: "completed",
        failureCode: "ERR_DELETION_FAILED",
        failureCategory: "partial_failure"
      })
    ).toMatchObject({
      status: "completed",
      successful: false,
      downloadable: false,
      evidenceComplete: false,
      reasonCode: "completed_state_missing_clean_evidence"
    });

    expect(
      normalizeGovernanceLifecycleState({
        kind: "workspace_deletion",
        id: "deletion-1",
        organizationId: "org-1",
        status: "failed",
        failureCode: "ERR_DELETION_FAILED",
        failureCategory: "delete_contracts"
      })
    ).toMatchObject({
      status: "failed",
      terminal: true,
      failed: true,
      evidenceComplete: true,
      reasonCode: "failed"
    });
  });

  it("prevents expired export artifacts from being treated as downloadable", () => {
    expect(
      normalizeGovernanceLifecycleState({
        kind: "contract_export",
        id: "export-1",
        organizationId: "org-1",
        status: "completed",
        completedAt: "2026-06-01T00:00:00.000Z",
        artifactStorage: "stored",
        expiresAt: "2000-01-01T00:00:00.000Z",
        downloadAvailable: true
      })
    ).toMatchObject({
      status: "completed",
      successful: true,
      downloadable: false
    });

    expect(
      normalizeGovernanceLifecycleState({
        kind: "contract_export",
        id: "export-1",
        organizationId: "org-1",
        status: "expired",
        expiredAt: "2026-06-08T00:00:00.000Z",
        artifactStorage: "expired",
        downloadAvailable: false
      })
    ).toMatchObject({
      status: "expired",
      terminal: true,
      downloadable: false,
      reasonCode: "expired"
    });
  });

  it("requires support diagnostics to declare a purpose code and strips raw customer data", () => {
    expect(
      buildSupportAccessDiagnostic({
        organizationId: "org-1",
        supportActorUserId: "support-1",
        objectClass: "contract_notes"
      })
    ).toMatchObject({ allowed: false, reason: "purpose_code_required" });

    const diagnostic = buildSupportAccessDiagnostic({
      organizationId: "org-1",
      supportActorUserId: "support-1",
      purposeCode: "customer_support_request",
      objectClass: "contract_notes",
      objectId: "note-1",
      metadata: {
        status: "failed",
        failure_code: "ERR_NOTE_LOOKUP_FAILED",
        count: 3,
        full_note_text: "SENSITIVE_NOTE_MARKER",
        raw_contract_text: "SENSITIVE_CONTRACT_MARKER",
        ocr_output: "SENSITIVE_OCR_MARKER",
        storage_path: "org-1/private/path.pdf",
        token: "SENSITIVE_TOKEN_MARKER",
        arbitrary_safe_sounding_field: "should be stripped"
      }
    });

    expect(diagnostic).toMatchObject({
      allowed: true,
      organizationId: "org-1",
      supportActorUserId: "support-1",
      purposeCode: "customer_support_request",
      objectClass: "contract_notes",
      objectId: "note-1",
      metadata: {
        status: "failed",
        failure_code: "ERR_NOTE_LOOKUP_FAILED",
        count: 3
      }
    });

    const rendered = JSON.stringify(diagnostic);
    for (const forbidden of [
      "SENSITIVE_NOTE_MARKER",
      "SENSITIVE_CONTRACT_MARKER",
      "SENSITIVE_OCR_MARKER",
      "org-1/private/path.pdf",
      "SENSITIVE_TOKEN_MARKER",
      "should be stripped"
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it("prepares support-access review evidence with internal role, purpose, object-class, and tenant scope", () => {
    expect(
      prepareSupportAccessReview({
        reviewId: "review-1",
        organizationId: "org-1",
        evidenceOrganizationId: "org-1",
        supportActorUserId: "support-1",
        supportRole: "operator",
        purposeCode: "customer_support_request",
        objectClass: "contract_metadata",
        status: "requested",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toMatchObject({ allowed: false, reason: "internal_support_or_admin_required" });

    expect(
      prepareSupportAccessReview({
        reviewId: "review-1",
        organizationId: "org-1",
        evidenceOrganizationId: "org-1",
        supportActorUserId: "support-1",
        supportRole: "internal_support",
        objectClass: "contract_metadata",
        status: "requested",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toMatchObject({ allowed: false, reason: "purpose_code_required" });

    expect(
      prepareSupportAccessReview({
        reviewId: "review-1",
        organizationId: "org-1",
        evidenceOrganizationId: "org-1",
        supportActorUserId: "support-1",
        supportRole: "internal_support",
        purposeCode: "customer_support_request",
        objectClass: "not_governed",
        status: "requested",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toMatchObject({ allowed: false, reason: "unsupported_object_class" });

    expect(
      prepareSupportAccessReview({
        reviewId: "review-1",
        organizationId: "org-1",
        evidenceOrganizationId: "org-2",
        supportActorUserId: "support-1",
        supportRole: "internal_support",
        purposeCode: "customer_support_request",
        objectClass: "contract_metadata",
        status: "requested",
        expiresAt: "2099-01-01T00:00:00.000Z"
      })
    ).toMatchObject({ allowed: false, reason: "organization_scope_mismatch" });
  });

  it("keeps support-access review evidence expiring, non-impersonating, and audit-safe", () => {
    const review = prepareSupportAccessReview(
      {
        reviewId: "review-1",
        organizationId: "org-1",
        evidenceOrganizationId: "org-1",
        supportActorUserId: "support-1",
        supportRole: "internal_admin",
        purposeCode: "security_review",
        objectClass: "contract_notes",
        objectId: "note-1",
        status: "approved",
        requestedAt: "2026-06-01T00:00:00.000Z",
        reviewedAt: "2026-06-02T00:00:00.000Z",
        expiresAt: "2026-06-30T00:00:00.000Z",
        reviewerUserId: "reviewer-1",
        policyEvidenceId: "policy-evidence-1",
        metadata: {
          status: "approved",
          failure_code: "SAFE_CODE",
          raw_contract_text: "SENSITIVE_CONTRACT_MARKER",
          full_note_text: "SENSITIVE_NOTE_MARKER",
          ocr_output: "SENSITIVE_OCR_MARKER",
          provider_payload: "SENSITIVE_PROVIDER_MARKER",
          storage_path: "org-1/private/file.pdf",
          token: "SENSITIVE_TOKEN_MARKER",
          arbitrary_field: "should be stripped",
          nested: {
            status: "nested safe but not allowlisted at support review layer",
            debug_trace: "SENSITIVE_DEBUG_MARKER"
          }
        }
      },
      new Date("2026-06-15T00:00:00.000Z")
    );

    expect(review).toMatchObject({
      allowed: true,
      evidence: {
        reviewId: "review-1",
        organizationId: "org-1",
        supportActorUserId: "support-1",
        supportRole: "internal_admin",
        purposeCode: "security_review",
        objectClass: "contract_notes",
        objectId: "note-1",
        status: "approved",
        active: true,
        reviewerUserId: "reviewer-1",
        policyEvidenceId: "policy-evidence-1",
        customerVisibleEvidenceBoundary: "safe_metadata_only",
        impersonationAllowed: false,
        metadata: {
          review_id: "review-1",
          organization_id: "org-1",
          support_actor_id: "support-1",
          purpose_code: "security_review",
          object_class: "contract_notes",
          object_id: "note-1",
          status: "approved",
          failure_code: "SAFE_CODE",
          reviewed_at: "2026-06-02T00:00:00.000Z",
          reviewer_user_id: "reviewer-1",
          policy_evidence_id: "policy-evidence-1",
          expires_at: "2026-06-30T00:00:00.000Z"
        }
      },
      audit: {
        organizationId: "org-1",
        actorUserId: "support-1",
        action: "governance.support_access_reviewed",
        entityType: "support_access",
        entityId: "review-1"
      }
    });

    const rendered = JSON.stringify(review);
    for (const forbidden of [
      "SENSITIVE_CONTRACT_MARKER",
      "SENSITIVE_NOTE_MARKER",
      "SENSITIVE_OCR_MARKER",
      "SENSITIVE_PROVIDER_MARKER",
      "org-1/private/file.pdf",
      "SENSITIVE_TOKEN_MARKER",
      "should be stripped",
      "SENSITIVE_DEBUG_MARKER"
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it("does not consider expired support-access review evidence active", () => {
    expect(
      prepareSupportAccessReview(
        {
          reviewId: "review-1",
          organizationId: "org-1",
          evidenceOrganizationId: "org-1",
          supportActorUserId: "support-1",
          supportRole: "internal_support",
          purposeCode: "incident_response",
          objectClass: "internal_support_log",
          status: "approved",
          expiresAt: "2026-06-01T00:00:00.000Z"
        },
        new Date("2026-06-02T00:00:00.000Z")
      )
    ).toMatchObject({
      allowed: true,
      evidence: {
        status: "expired",
        active: false
      },
      audit: {
        details: {
          status: "expired",
          expires_at: "2026-06-01T00:00:00.000Z"
        }
      }
    });
  });

  it("builds governance audit inputs from allow-listed metadata only", () => {
    const auditInput = buildGovernanceAuditLogInput({
      organizationId: "org-1",
      actorUserId: "admin-1",
      eventName: "governance.retention_policy_changed",
      entityType: "governance",
      entityId: "policy-1",
      metadata: {
        organization_id: "org-1",
        actor_user_id: "admin-1",
        policy_id: "policy-1",
        object_class: "contract_notes",
        retention_window: "future_policy",
        full_note_text: "SENSITIVE_NOTE_MARKER",
        provider_payload: "SENSITIVE_PROVIDER_MARKER",
        debug_trace: "SENSITIVE_DEBUG_MARKER",
        unsupported_field: "not allowed"
      }
    });

    expect(auditInput).toEqual({
      organizationId: "org-1",
      actorUserId: "admin-1",
      action: "governance.retention_policy_changed",
      entityType: "governance",
      entityId: "policy-1",
      details: {
        organization_id: "org-1",
        actor_user_id: "admin-1",
        policy_id: "policy-1",
        object_class: "contract_notes",
        retention_window: "future_policy"
      }
    });
    expect(JSON.stringify(auditInput)).not.toContain("SENSITIVE_NOTE_MARKER");
    expect(JSON.stringify(auditInput)).not.toContain("SENSITIVE_PROVIDER_MARKER");
    expect(JSON.stringify(auditInput)).not.toContain("SENSITIVE_DEBUG_MARKER");
  });

  it("recursively sanitizes governance metadata keys and sensitive values at any depth", () => {
    expect(
      sanitizeGovernanceMetadata({
        failure_code: "ERR_EXPORT_FAILED",
        reason: "raw contract payload leaked in provider response",
        safe_status: "failed",
        nested: {
          status: "failed",
          token: "SENSITIVE_TOKEN_MARKER",
          details: {
            failure_category: "storage",
            provider_payload: "SENSITIVE_PROVIDER_MARKER",
            message: "debug trace contained uploaded document contents"
          }
        },
        attempts: [
          {
            count: 1,
            full_note_text: "SENSITIVE_NOTE_MARKER",
            reason_code: "safe_reason"
          },
          "email body contained SENSITIVE_EMAIL_MARKER",
          "safe scalar"
        ],
        backup_contents: "SENSITIVE_BACKUP_MARKER"
      })
    ).toEqual({
      failure_code: "ERR_EXPORT_FAILED",
      safe_status: "failed",
      nested: {
        status: "failed",
        details: {
          failure_category: "storage"
        }
      },
      attempts: [
        {
          count: 1,
          reason_code: "safe_reason"
        },
        "safe scalar"
      ]
    });
  });
});
