import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildEnterpriseOnboardingReadiness,
  buildEnterpriseOnboardingSupportDiagnostic,
  type EnterpriseOnboardingReadinessInput
} from "@/lib/product/enterprise-onboarding-readiness";
import { SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA } from "@/lib/product/support-success";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseInput(overrides: Partial<EnterpriseOnboardingReadinessInput> = {}) {
  return {
    organizationId: "org-1",
    organizationProfileCompleted: false,
    planTier: "free",
    subscriptionStatus: "inactive",
    billingProvider: null,
    trialEndsAt: null,
    subscriptionCurrentPeriodEnd: null,
    contractCount: 0,
    reviewedContractCount: 0,
    ownerAssignedContractCount: 0,
    trustedReminderCount: 0,
    completedExportCount: 0,
    auditVisibilityReviewed: false,
    dataGovernanceReviewed: false,
    operationalContactCount: 0,
    identityReadinessReviewed: false,
    ssoScimContractReadinessReviewed: false,
    providerBackedSsoEnabled: false,
    providerBackedScimEnabled: false,
    ...overrides
  } satisfies EnterpriseOnboardingReadinessInput;
}

function item(
  readiness: ReturnType<typeof buildEnterpriseOnboardingReadiness>,
  category: string
) {
  const found = readiness.items.find((readinessItem) => readinessItem.category === category);
  expect(found, category).toBeDefined();
  return found!;
}

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("enterprise onboarding readiness", () => {
  it("keeps a new account blocked on the renewal-control pilot path before paid or enterprise launch", () => {
    const readiness = buildEnterpriseOnboardingReadiness(baseInput());

    expect(readiness.gateStatus).toEqual({
      pilot: false,
      paid_launch: false,
      enterprise_launch: false
    });
    expect(item(readiness, "organization_profile").status).toBe("needs_action");
    expect(item(readiness, "first_contract_imported").status).toBe("needs_action");
    expect(item(readiness, "sso_scim_boundary").status).toBe("future");
    expect(readiness.customerSafeSummary).toMatch(/finish the renewal-control pilot path/i);
  });

  it("separates pilot, paid launch, and enterprise launch readiness instead of flattening them", () => {
    const readiness = buildEnterpriseOnboardingReadiness(
      baseInput({
        organizationProfileCompleted: true,
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        contractCount: 2,
        reviewedContractCount: 1,
        ownerAssignedContractCount: 1,
        trustedReminderCount: 1,
        completedExportCount: 1
      })
    );

    expect(readiness.gateStatus.pilot).toBe(true);
    expect(readiness.gateStatus.paid_launch).toBe(true);
    expect(readiness.gateStatus.enterprise_launch).toBe(false);
    expect(item(readiness, "audit_event_visibility").status).toBe("needs_action");
    expect(item(readiness, "data_governance_review").status).toBe("needs_action");
    expect(item(readiness, "operational_contacts").status).toBe("needs_action");
    expect(item(readiness, "identity_readiness").status).toBe("needs_action");
  });

  it("does not mark SSO/SCIM complete from readiness review alone when provider-backed runtime is future-only", () => {
    const readiness = buildEnterpriseOnboardingReadiness(
      baseInput({
        organizationProfileCompleted: true,
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        contractCount: 1,
        reviewedContractCount: 1,
        ownerAssignedContractCount: 1,
        trustedReminderCount: 1,
        completedExportCount: 1,
        auditVisibilityReviewed: true,
        dataGovernanceReviewed: true,
        operationalContactCount: 2,
        identityReadinessReviewed: true,
        ssoScimContractReadinessReviewed: true
      })
    );

    expect(item(readiness, "identity_readiness").status).toBe("complete");
    expect(item(readiness, "sso_scim_boundary").status).toBe("future");
    expect(readiness.gateStatus.enterprise_launch).toBe(false);
    expect(item(readiness, "sso_scim_boundary").customerSafeReason).toMatch(/future work/i);
  });

  it("can represent enterprise launch readiness only when provider-backed SSO and SCIM are explicitly enabled", () => {
    const readiness = buildEnterpriseOnboardingReadiness(
      baseInput({
        organizationProfileCompleted: true,
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        contractCount: 1,
        reviewedContractCount: 1,
        ownerAssignedContractCount: 1,
        trustedReminderCount: 1,
        completedExportCount: 1,
        auditVisibilityReviewed: true,
        dataGovernanceReviewed: true,
        operationalContactCount: 2,
        identityReadinessReviewed: true,
        ssoScimContractReadinessReviewed: true,
        providerBackedSsoEnabled: true,
        providerBackedScimEnabled: true
      })
    );

    expect(readiness.items.every((readinessItem) => readinessItem.status === "complete")).toBe(true);
    expect(readiness.gateStatus.enterprise_launch).toBe(true);
  });

  it("builds support-safe diagnostics with allowed metadata only", () => {
    const diagnostic = buildEnterpriseOnboardingSupportDiagnostic(
      baseInput({
        contractCount: 3,
        reviewedContractCount: 2,
        supportMetadata: {
          request_id: "req-1",
          status: "raw contract text should never be logged",
          failure_code: "ERR_ENTERPRISE_ONBOARDING_BLOCKED_001",
          raw_contract_text: "RAW_CONTRACT_TEXT_MARKER",
          note_text: "FULL_NOTE_MARKER",
          ocr_output: "OCR_OUTPUT_MARKER",
          provider_payload: { secret: "SECRET_MARKER" },
          storage_path: "supabase/storage/private/path"
        }
      })
    );
    const rendered = JSON.stringify(diagnostic);

    expect(diagnostic.signalType).toBe("enterprise_onboarding_support_diagnostic");
    expect(diagnostic.safeMetadata).toMatchObject({
      organization_id: "org-1",
      contract_count: 3,
      reviewed_contract_count: 2,
      request_id: "req-1",
      failure_code: "ERR_ENTERPRISE_ONBOARDING_BLOCKED_001"
    });
    expect(diagnostic.safeMetadata.status).toBe("[REDACTED]");

    for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
      expect(rendered, forbiddenField).not.toContain(forbiddenField);
    }

    for (const marker of [
      "RAW_CONTRACT_TEXT_MARKER",
      "FULL_NOTE_MARKER",
      "OCR_OUTPUT_MARKER",
      "SECRET_MARKER",
      "supabase/storage/private/path"
    ]) {
      expect(rendered).not.toContain(marker);
    }
  });

  it("documents enterprise onboarding readiness without claiming SSO/SCIM is shipped", () => {
    const readinessDoc = readRepoFile("docs", "ENTERPRISE_ONBOARDING_READINESS.md");
    const onboardingDoc = readRepoFile("docs", "CUSTOMER_ONBOARDING_BOUNDARY.md");

    for (const category of [
      "organization_profile",
      "billing_subscription",
      "first_contract_imported",
      "owner_assignment",
      "reminder_policy",
      "export_capability",
      "audit_event_visibility",
      "data_governance_review",
      "operational_contacts",
      "identity_readiness",
      "sso_scim_boundary"
    ]) {
      expect(readinessDoc, category).toContain(`\`${category}\``);
    }

    expect(readinessDoc).toContain("provider-backed SSO login is not shipped");
    expect(readinessDoc).toContain("live SCIM provisioning endpoints are not shipped");
    expect(onboardingDoc).toContain("ENTERPRISE_ONBOARDING_READINESS.md");
  });
});
