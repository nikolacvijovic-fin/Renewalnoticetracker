import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFERRED_CAPABILITY_SLUGS } from "@/lib/product/deferred-capabilities";
import {
  DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS,
  DATA_GOVERNANCE_CAPABILITIES,
  DATA_GOVERNANCE_CAPABILITY_IDS,
  DATA_GOVERNANCE_FORBIDDEN_METADATA,
  GOVERNED_DATA_CLASSES,
  GOVERNED_DATA_CLASS_IDS,
  LEGAL_HOLD_AND_DELETION_CONTRACTS
} from "@/lib/product/data-governance";
import { PRODUCT_EVENT_TAXONOMY } from "@/lib/product/event-taxonomy";
import { PLATFORM_MODULES } from "@/lib/product/platform-modules";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("data governance and retention boundary", () => {
  it("classifies every governance capability and keeps future controls out of current runtime", () => {
    for (const capabilityId of DATA_GOVERNANCE_CAPABILITY_IDS) {
      const capability = DATA_GOVERNANCE_CAPABILITIES[capabilityId];

      expect(["shipped", "deferred", "future", "excluded"]).toContain(capability.status);
      expect(capability.currentBehavior.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.futureEnterpriseBehavior.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.retentionDeletionExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(capability.auditExpectation.trim().length, capabilityId).toBeGreaterThan(0);
      expect(["low", "moderate", "high", "critical"]).toContain(capability.privacyRiskLevel);
      expect(capability.requiredTestsOrReleaseGates.length, capabilityId).toBeGreaterThan(0);
      expect(capability.forbiddenBehavior.length, capabilityId).toBeGreaterThan(0);
    }

    for (const futureOnly of ["legal_hold", "data_residency"] as const) {
      expect(DATA_GOVERNANCE_CAPABILITIES[futureOnly].status).toBe("future");
      expect(DATA_GOVERNANCE_CAPABILITIES[futureOnly].allowedRuntimeSurfaceToday).toBe("none");
      expect(DATA_GOVERNANCE_CAPABILITIES[futureOnly].requiredPlanOrGate).toBe("enterprise_future");
    }
  });

  it("represents current shipped governance controls without pretending enterprise settings exist", () => {
    expect(DATA_GOVERNANCE_CAPABILITIES.export_artifact_expiry.status).toBe("shipped");
    expect(DATA_GOVERNANCE_CAPABILITIES.export_artifact_expiry.currentBehavior).toContain(
      "expiry metadata"
    );
    expect(DATA_GOVERNANCE_CAPABILITIES.workspace_deletion_window.status).toBe("shipped");
    expect(DATA_GOVERNANCE_CAPABILITIES.workspace_deletion_window.currentBehavior).toContain(
      "Owners can request workspace deletion"
    );
    expect(DATA_GOVERNANCE_CAPABILITIES.backup_restore_evidence.status).toBe("shipped");
    expect(DATA_GOVERNANCE_CAPABILITIES.backup_restore_evidence.allowedRuntimeSurfaceToday).toBe(
      "internal_operations"
    );

    for (const notLive of [
      "contract_document_retention",
      "ocr_extracted_text_retention",
      "audit_log_retention",
      "legal_hold",
      "data_residency",
      "customer_data_export",
      "support_access_evidence"
    ] as const) {
      expect(DATA_GOVERNANCE_CAPABILITIES[notLive].status, notLive).not.toBe("shipped");
    }
  });

  it("defines retention, deletion, export, privacy, legal-hold, and support-access rules for every data class", () => {
    expect(GOVERNED_DATA_CLASS_IDS).toEqual(
      expect.arrayContaining([
        "uploaded_contract_file",
        "contract_metadata",
        "extracted_ocr_text",
        "generated_intelligence",
        "contract_notes",
        "export_artifact",
        "audit_event",
        "analytics_event",
        "reminder_notification",
        "billing_record",
        "internal_support_log",
        "backup_snapshot"
      ])
    );

    for (const classId of GOVERNED_DATA_CLASS_IDS) {
      const dataClass = GOVERNED_DATA_CLASSES[classId];
      expect(dataClass.sensitivity, classId).toBeTruthy();
      expect(dataClass.defaultRetentionPosture, classId).toBeTruthy();
      expect(dataClass.deletionBehavior, classId).toBeTruthy();
      expect(dataClass.exportability, classId).toBeTruthy();
      expect(typeof dataClass.legalHoldMayApply, classId).toBe("boolean");
      expect(typeof dataClass.customerSupportMayAccess, classId).toBe("boolean");
      expect(dataClass.rawContentAllowedInLogsOrAlerts, classId).toBe(false);
      expect(dataClass.notes.trim().length, classId).toBeGreaterThan(0);
    }
  });

  it("keeps high-risk raw content out of logs, alerts, audit metadata, and support evidence", () => {
    expect(DATA_GOVERNANCE_FORBIDDEN_METADATA).toEqual(
      expect.arrayContaining([
        "raw_contract_text",
        "ocr_output",
        "full_note_text",
        "storage_path",
        "provider_payload",
        "token",
        "secret",
        "backup_contents",
        "uploaded_document_contents",
        "email_body",
        "debug_trace"
      ])
    );

    for (const contract of [
      ...LEGAL_HOLD_AND_DELETION_CONTRACTS,
      ...DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS
    ]) {
      const contractName = "id" in contract ? contract.id : contract.eventName;
      for (const forbidden of DATA_GOVERNANCE_FORBIDDEN_METADATA) {
        expect(contract.forbiddenMetadata, `${contractName} forbids ${forbidden}`).toContain(
          forbidden
        );
        expect(contract.safeMetadata, `${contractName} must not mark ${forbidden} safe`).not.toContain(
          forbidden
        );
      }
    }
  });

  it("defines legal hold and deletion lifecycle contracts while keeping legal hold future-only", () => {
    const lifecycleIds = LEGAL_HOLD_AND_DELETION_CONTRACTS.map((contract) => contract.id);

    expect(lifecycleIds).toEqual(
      expect.arrayContaining([
        "legal_hold_activation",
        "legal_hold_release",
        "deletion_request_received",
        "deletion_scheduled",
        "deletion_executed",
        "deletion_blocked_by_legal_hold",
        "deletion_failed",
        "backup_restore_evidence_reviewed"
      ])
    );

    for (const contract of LEGAL_HOLD_AND_DELETION_CONTRACTS) {
      if (contract.id.startsWith("legal_hold") || contract.id === "deletion_blocked_by_legal_hold") {
        expect(contract.status, contract.id).toBe("future");
      }
      expect(contract.safeMetadata.length, contract.id).toBeGreaterThan(0);
      expect(contract.description.trim().length, contract.id).toBeGreaterThan(0);
    }
  });

  it("defines safe governance audit-event contracts", () => {
    const eventNames = DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS.map((contract) => contract.eventName);

    expect(eventNames).toEqual(
      expect.arrayContaining([
        "governance.retention_policy_changed",
        "governance.legal_hold_created",
        "governance.legal_hold_released",
        "privacy.workspace_deletion_requested",
        "privacy.workspace_deletion_scheduled",
        "privacy.workspace_deletion_executed",
        "privacy.workspace_deletion_failed",
        "exports.artifact_expired",
        "exports.artifact_deleted",
        "governance.customer_data_export_requested",
        "governance.customer_data_export_completed",
        "governance.support_access_reviewed"
      ])
    );

    expect(
      DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS.find(
        (contract) => contract.eventName === "governance.legal_hold_created"
      )?.status
    ).toBe("future");
    expect(
      DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS.find(
        (contract) => contract.eventName === "privacy.workspace_deletion_requested"
      )?.status
    ).toBe("shipped");
    expect(
      DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS.find(
        (contract) => contract.eventName === "privacy.workspace_deletion_failed"
      )?.status
    ).toBe("future");
  });

  it("keeps governance audit contracts aligned with the product event taxonomy", () => {
    for (const contract of DATA_GOVERNANCE_AUDIT_EVENT_CONTRACTS) {
      const event = PRODUCT_EVENT_TAXONOMY[contract.eventName as keyof typeof PRODUCT_EVENT_TAXONOMY];
      expect(event, contract.eventName).toBeDefined();
      expect(event.type, contract.eventName).toBe("audit");
      expect(event.emittedToday, contract.eventName).toBe(contract.status === "shipped");

      for (const forbidden of contract.forbiddenMetadata) {
        expect(event.safeMetadataFields, `${contract.eventName} should not allow ${forbidden}`).not.toContain(
          forbidden
        );
      }
    }
  });

  it("keeps platform module and deferred capability registries aligned with governance ownership", () => {
    const module = PLATFORM_MODULES.enterprise_identity_rbac_retention;

    expect(module.status).toBe("deferred");
    expect(module.allowedInCurrentShippedKernel).toBe(false);
    expect(module.ownerSurfaces.modules).toContain("lib/product/data-governance.ts");
    expect(module.ownerSurfaces.modules).toContain("lib/product/data-governance-runtime.ts");
    expect(module.ownerSurfaces.docs).toEqual(
      expect.arrayContaining([
        "docs/DATA_GOVERNANCE_RETENTION_BOUNDARY.md",
        "docs/enterprise/DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md"
      ])
    );
    expect(module.requiredTestsOrReleaseGates).toContain("tests/data-governance-boundary.test.ts");
    expect(module.requiredTestsOrReleaseGates).toContain("tests/data-governance-runtime.test.ts");
    expect(module.deferredCapabilitySlugs).toEqual(
      expect.arrayContaining(["enterprise_data_governance_retention"])
    );
    expect(DEFERRED_CAPABILITY_SLUGS.has("enterprise_data_governance_retention")).toBe(true);
  });

  it("keeps runtime settings free of live retention and legal-hold setup UI", () => {
    const settingsText = [
      readRepoFile("app", "dashboard", "settings", "page.tsx"),
      readRepoFile("components", "forms", "settings-form.tsx")
    ].join("\n");

    for (const forbidden of [
      "Legal hold",
      "Retention policy",
      "Data residency",
      "Deletion window",
      "Customer data export",
      "Support access review"
    ]) {
      expect(settingsText).not.toContain(forbidden);
    }
  });

  it("keeps docs aligned with the governance registry and current/future split", () => {
    const boundaryDoc = readRepoFile("docs", "DATA_GOVERNANCE_RETENTION_BOUNDARY.md");
    const implementationDoc = readRepoFile("docs", "enterprise", "DATA_GOVERNANCE_IMPLEMENTATION_PLAN.md");
    const platformDoc = readRepoFile("docs", "PLATFORM_MODULE_REGISTRY.md");
    const architectureDoc = readRepoFile("docs", "ARCHITECTURE_BOUNDARIES.md");

    expect(boundaryDoc).toContain("Canonical code source");
    expect(boundaryDoc).toContain("data-governance-runtime.ts");
    expect(boundaryDoc).toContain("runtime retention-policy MVP seam");
    expect(boundaryDoc).toContain("policy existence does not trigger automatic deletion");
    expect(boundaryDoc).toContain("Workspace deletion exists today");
    expect(boundaryDoc).toContain("Legal hold is future-only");
    expect(implementationDoc).toContain("Status: Enterprise runtime bridge plus future Enterprise planning.");
    expect(implementationDoc).toContain("Current Runtime Bridge");
    expect(implementationDoc).toContain("cannot enable automatic deletion by itself");
    expect(platformDoc).toContain("DATA_GOVERNANCE_RETENTION_BOUNDARY.md");
    expect(architectureDoc).toContain("DATA_GOVERNANCE_RETENTION_BOUNDARY.md");

    for (const classId of GOVERNED_DATA_CLASS_IDS) {
      expect(boundaryDoc, classId).toContain(`\`${classId}\``);
    }
  });
});
