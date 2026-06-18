import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ONBOARDING_MILESTONE_IDS,
  CUSTOMER_ONBOARDING_MILESTONES
} from "@/lib/product/customer-onboarding";
import {
  CUSTOMER_HEALTH_SIGNAL_IDS,
  CUSTOMER_HEALTH_SIGNALS,
  SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT,
  SUPPORT_SUCCESS_CAPABILITIES,
  SUPPORT_SUCCESS_CAPABILITY_IDS,
  SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA,
  isCustomerHealthSignalMetadataSafe,
  isSupportDiagnosticBundleFieldAllowed
} from "@/lib/product/support-success";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("customer onboarding and support/success boundary", () => {
  it("defines the first-value onboarding path with surfaces, signals, privacy, support follow-up, and release proof", () => {
    expect(CUSTOMER_ONBOARDING_MILESTONE_IDS).toEqual([
      "workspace_created",
      "first_contract_uploaded",
      "first_contract_reviewed",
      "first_owner_assigned",
      "first_reminder_trusted",
      "first_decision_recorded",
      "first_export_completed",
      "billing_configured",
      "first_intelligence_viewed",
      "renewal_loop_completed"
    ]);

    for (const milestoneId of CUSTOMER_ONBOARDING_MILESTONE_IDS) {
      const milestone = CUSTOMER_ONBOARDING_MILESTONES[milestoneId];
      expect(["shipped", "deferred", "future"]).toContain(milestone.status);
      expect(milestone.ownerSurface.trim().length, `${milestoneId} needs an owner surface`).toBeGreaterThan(0);
      expect(
        [
          ...milestone.requiredSignal.auditEvents,
          ...milestone.requiredSignal.analyticsEvents,
          ...milestone.requiredSignal.monitoringEvents
        ].length,
        `${milestoneId} needs at least one event/signal`
      ).toBeGreaterThan(0);
      expect(["low", "medium", "high"]).toContain(milestone.privacySensitivity);
      expect(milestone.customerVisibleCopyExpectation.length, `${milestoneId} needs copy expectation`).toBeGreaterThan(20);
      expect(milestone.supportFollowUpExpectation.length, `${milestoneId} needs support expectation`).toBeGreaterThan(20);
      expect(milestone.requiredTestsOrReleaseGates).toContain(
        "tests/customer-onboarding-support-boundary.test.ts"
      );
      expect(milestone.forbiddenBehavior.length, `${milestoneId} needs forbidden behavior`).toBeGreaterThan(0);
    }
  });

  it("defines support/success capabilities with allowed metadata and forbidden raw customer data", () => {
    expect(SUPPORT_SUCCESS_CAPABILITY_IDS).toEqual([
      "account_health_snapshot",
      "onboarding_checklist",
      "support_diagnostic_bundle",
      "safe_account_notes",
      "escalation_workflow",
      "incident_customer_communication",
      "support_access_review",
      "assisted_troubleshooting",
      "enterprise_renewal_review",
      "billing_exception_support",
      "data_export_deletion_support"
    ]);

    for (const capabilityId of SUPPORT_SUCCESS_CAPABILITY_IDS) {
      const capability = SUPPORT_SUCCESS_CAPABILITIES[capabilityId];
      expect(["shipped", "deferred", "future"]).toContain(capability.status);
      expect(["internal_ops", "customer_services_copy", "none"]).toContain(
        capability.allowedRuntimeSurfaceToday
      );
      expect(capability.requiredRoleOrAuthBoundary.length, `${capabilityId} needs auth boundary`).toBeGreaterThan(0);
      expect(capability.allowedMetadata.length, `${capabilityId} needs allowed metadata`).toBeGreaterThan(0);
      expect(capability.forbiddenRawCustomerData).toEqual(
        expect.arrayContaining([
          "raw_contract_text",
          "full_notes",
          "ocr_output",
          "provider_payload",
          "storage_path",
          "tokens",
          "secrets",
          "full_billing_payload",
          "raw_customer_file"
        ])
      );
      expect(capability.auditExpectation.length, `${capabilityId} needs audit expectation`).toBeGreaterThan(20);
      expect(capability.monitoringExpectation.length, `${capabilityId} needs monitoring expectation`).toBeGreaterThan(20);
      expect(
        capability.customerCommunicationExpectation.length,
        `${capabilityId} needs communication expectation`
      ).toBeGreaterThan(20);
      expect(capability.requiredTestsOrReleaseGates).toContain(
        "tests/customer-onboarding-support-boundary.test.ts"
      );

      for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
        expect(capability.allowedMetadata, `${capabilityId} should not allow ${forbiddenField}`).not.toContain(
          forbiddenField
        );
      }
    }
  });

  it("keeps support diagnostics code-first and forbids raw customer content", () => {
    expect(SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT.status).toBe("shipped");
    expect(SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT.allowedFields).toEqual(
      expect.arrayContaining([
        "organization_id",
        "plan_tier",
        "subscription_status",
        "contract_count",
        "workflow_state_summary",
        "failure_code",
        "failure_category",
        "queue_status",
        "export_request_id",
        "reminder_job_id",
        "ocr_job_id",
        "request_id"
      ])
    );
    expect(SUPPORT_DIAGNOSTIC_BUNDLE_CONTRACT.forbiddenFields).toEqual(
      expect.arrayContaining([
        "raw_contract_text",
        "full_notes",
        "ocr_output",
        "raw_extracted_evidence",
        "provider_payload",
        "storage_path",
        "tokens",
        "secrets",
        "full_billing_payload",
        "raw_customer_file"
      ])
    );

    expect(isSupportDiagnosticBundleFieldAllowed("organization_id")).toBe(true);
    expect(isSupportDiagnosticBundleFieldAllowed("failure_code")).toBe(true);

    for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
      expect(isSupportDiagnosticBundleFieldAllowed(forbiddenField), forbiddenField).toBe(false);
    }
  });

  it("keeps customer health signals future-only, internal-only, and safe-metadata-only", () => {
    expect(CUSTOMER_HEALTH_SIGNAL_IDS).toEqual([
      "no_contract_uploaded_after_signup",
      "contracts_uploaded_but_unreviewed",
      "contracts_without_owner",
      "reminders_not_trusted",
      "decisions_missing",
      "export_failed_repeatedly",
      "billing_exception_needs_followup",
      "ocr_queue_delayed",
      "support_escalation_open",
      "enterprise_security_review_pending"
    ]);

    for (const signalId of CUSTOMER_HEALTH_SIGNAL_IDS) {
      const signal = CUSTOMER_HEALTH_SIGNALS[signalId];
      expect(signal.status, signalId).toBe("future");
      expect(signal.customerFacing, signalId).toBe(false);
      expect(["P1", "P2", "P3"]).toContain(signal.severity);
      expect(signal.triggerSource.length, `${signalId} needs trigger source`).toBeGreaterThan(10);
      expect(signal.recommendedSupportAction.length, `${signalId} needs support action`).toBeGreaterThan(20);
      expect(signal.requiredTestsOrReleaseGates).toContain(
        "tests/customer-onboarding-support-boundary.test.ts"
      );

      for (const safeField of signal.safeMetadata) {
        expect(isCustomerHealthSignalMetadataSafe(signalId, safeField), `${signalId}:${safeField}`).toBe(
          true
        );
      }

      for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
        expect(signal.safeMetadata, `${signalId} should not allow ${forbiddenField}`).not.toContain(
          forbiddenField
        );
        expect(isCustomerHealthSignalMetadataSafe(signalId, forbiddenField)).toBe(false);
      }
    }
  });

  it("keeps support access review future-only unless a real enterprise gate ships", () => {
    const supportAccessReview = SUPPORT_SUCCESS_CAPABILITIES.support_access_review;
    expect(supportAccessReview.status).toBe("future");
    expect(supportAccessReview.allowedRuntimeSurfaceToday).toBe("none");
    expect(supportAccessReview.requiredRoleOrAuthBoundary).toBe("future_enterprise_support_gate");
    expect(supportAccessReview.auditExpectation).toMatch(/data-governance support-access evidence/i);
  });

  it("does not expose unsafe impersonation, health-score, or raw-data support UI", () => {
    const navigationText = SHIPPED_FIRST_SCOPE.customerNavigation
      .map((item) => `${item.href} ${item.label}`)
      .join(" ");
    const runtimeUiText = [
      navigationText,
      readRepoFile("app", "dashboard", "settings", "page.tsx"),
      readRepoFile("components", "forms", "settings-form.tsx"),
      readRepoFile("app", "internal", "ops", "page.tsx"),
      readRepoFile("components", "admin", "admin-panel.tsx")
    ].join("\n");

    for (const forbidden of [
      /impersonate customer/i,
      /support impersonation/i,
      /raw contract browser/i,
      /raw data browsing/i,
      /customer health score/i,
      /account health score/i,
      /customer success dashboard/i,
      /support notes/i
    ]) {
      expect(runtimeUiText).not.toMatch(forbidden);
    }
  });

  it("keeps docs, registries, and platform module ownership aligned", () => {
    const onboardingDoc = readRepoFile("docs", "CUSTOMER_ONBOARDING_BOUNDARY.md");
    const supportDoc = readRepoFile("docs", "SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md");
    const implementationDoc = readRepoFile(
      "docs",
      "enterprise",
      "SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md"
    );
    const platformDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");
    const module = PLATFORM_MODULES.admin_support_operations;

    expect(module.ownerSurfaces.modules).toEqual(
      expect.arrayContaining(["lib/product/customer-onboarding.ts", "lib/product/support-success.ts"])
    );
    expect(module.ownerSurfaces.docs).toEqual(
      expect.arrayContaining([
        "docs/CUSTOMER_ONBOARDING_BOUNDARY.md",
        "docs/SUPPORT_SUCCESS_OPERATIONS_BOUNDARY.md",
        "docs/enterprise/SUPPORT_SUCCESS_IMPLEMENTATION_PLAN.md"
      ])
    );
    expect(module.requiredTestsOrReleaseGates).toContain(
      "tests/customer-onboarding-support-boundary.test.ts"
    );

    for (const milestoneId of CUSTOMER_ONBOARDING_MILESTONE_IDS) {
      expect(onboardingDoc, milestoneId).toContain(`\`${milestoneId}\``);
    }

    for (const capabilityId of SUPPORT_SUCCESS_CAPABILITY_IDS) {
      expect(supportDoc, capabilityId).toContain(`\`${capabilityId}\``);
    }

    for (const signalId of CUSTOMER_HEALTH_SIGNAL_IDS) {
      expect(supportDoc, signalId).toContain(`\`${signalId}\``);
    }

    expect(implementationDoc).toContain("lib/product/customer-onboarding.ts");
    expect(implementationDoc).toContain("lib/product/support-success.ts");
    expect(platformDoc).toContain("lib/product/customer-onboarding.ts");
    expect(platformDoc).toContain("lib/product/support-success.ts");
    expect(platformDoc).toContain("tests/customer-onboarding-support-boundary.test.ts");
  });
});
