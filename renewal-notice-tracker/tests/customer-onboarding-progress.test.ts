import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildCustomerOnboardingProgress,
  type CustomerOnboardingProgressInput
} from "@/lib/product/customer-onboarding-progress";
import { CUSTOMER_ONBOARDING_MILESTONE_IDS } from "@/lib/product/customer-onboarding";
import { SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA } from "@/lib/product/support-success";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function baseInput(overrides: Partial<CustomerOnboardingProgressInput> = {}): CustomerOnboardingProgressInput {
  return {
    organizationId: "org-1",
    organizationCreatedAt: "2026-01-01T00:00:00.000Z",
    hasActiveOrganizationMembership: true,
    planTier: "free",
    subscriptionStatus: "inactive",
    billingProvider: null,
    trialEndsAt: null,
    subscriptionCurrentPeriodEnd: null,
    totalContracts: 0,
    reviewedContracts: 0,
    ownerAssignedContracts: 0,
    trustedReminderCount: 0,
    liveObligationCount: 0,
    decisionCount: 0,
    completedExportCount: 0,
    intelligenceViewCount: 0,
    acknowledgedContractCount: 0,
    closedOrReopenedCycleCount: 0,
    ...overrides
  };
}

function milestone(progress: ReturnType<typeof buildCustomerOnboardingProgress>, id: string) {
  const found = progress.milestones.find((item) => item.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

describe("customer onboarding progress", () => {
  it("handles a new workspace without leaking future or support-only signals into customer progress", () => {
    const progress = buildCustomerOnboardingProgress(
      baseInput({
        futureEventNames: [
          "reminder.trusted",
          "cycle.closed",
          "billing.provider_exception_configured",
          "support.escalation_opened"
        ]
      })
    );

    expect(progress.completedCount).toBe(1);
    expect(progress.nextMilestone?.id).toBe("first_contract_uploaded");
    expect(milestone(progress, "workspace_created").completed).toBe(true);
    expect(milestone(progress, "first_reminder_trusted").completed).toBe(false);
    expect(milestone(progress, "renewal_loop_completed").completed).toBe(false);
  });

  it("does not allow future/deferred evidence to complete shipped milestones", () => {
    const progress = buildCustomerOnboardingProgress(
      baseInput({
        totalContracts: 1,
        reviewedContracts: 1,
        ownerAssignedContracts: 1,
        futureEventNames: ["reminder.trusted", "reminder.activated", "cycle.closed"]
      })
    );

    expect(milestone(progress, "first_contract_uploaded").completed).toBe(true);
    expect(milestone(progress, "first_contract_reviewed").completed).toBe(true);
    expect(milestone(progress, "first_owner_assigned").completed).toBe(true);
    expect(milestone(progress, "first_reminder_trusted").completed).toBe(false);
    expect(progress.firstValueCompleted).toBe(false);
  });

  it("derives every completed milestone from shipped event evidence or durable state fallbacks", () => {
    const progress = buildCustomerOnboardingProgress(
      baseInput({
        planTier: "growth",
        subscriptionStatus: "active",
        billingProvider: "paddle",
        totalContracts: 3,
        reviewedContracts: 2,
        ownerAssignedContracts: 2,
        trustedReminderCount: 1,
        liveObligationCount: 1,
        decisionCount: 1,
        completedExportCount: 1,
        intelligenceViewCount: 1,
        acknowledgedContractCount: 1,
        closedOrReopenedCycleCount: 1
      })
    );

    expect(progress.milestones.map((item) => item.id)).toEqual(CUSTOMER_ONBOARDING_MILESTONE_IDS);
    expect(progress.completedCount).toBe(progress.totalCount);
    expect(progress.firstValueCompleted).toBe(true);
    expect(progress.renewalLoopCompleted).toBe(true);
    expect(progress.nextMilestone).toBeNull();

    for (const item of progress.milestones) {
      expect(["shipped_event", "state_or_query_fallback"]).toContain(item.evidenceKind);
      expect(item.evidence.length, `${item.id} needs concrete evidence`).toBeGreaterThan(0);
    }
  });

  it("can complete milestones from real shipped event evidence without treating roadmap events as shipped", () => {
    const progress = buildCustomerOnboardingProgress(
      baseInput({
        shippedEventNames: [
          "auth_signup_completed",
          "contract_upload_completed",
          "contract_review_completed",
          "contract_owner_assigned",
          "reminder_scheduled",
          "renewal_decision_recorded",
          "contracts.exported",
          "billing_checkout_started",
          "intelligence.risk_queue_viewed",
          "acknowledgment_recorded",
          "renewal_cycle.updated"
        ],
        futureEventNames: ["cycle.closed", "billing.provider_exception_configured"]
      })
    );

    expect(progress.completedCount).toBe(progress.totalCount);
    expect(milestone(progress, "first_reminder_trusted").evidenceKind).toBe("shipped_event");
    expect(milestone(progress, "renewal_loop_completed").evidenceKind).toBe("shipped_event");
    expect(milestone(progress, "renewal_loop_completed").evidence).not.toContain("cycle.closed");
  });

  it("keeps onboarding output customer-safe and bounded even if callers pass sensitive accidental fields", () => {
    const progress = buildCustomerOnboardingProgress({
      ...baseInput({ totalContracts: 1 }),
      raw_contract_text: "RAW_CONTRACT_TEXT_MARKER",
      full_notes: "FULL_NOTE_MARKER",
      ocr_output: "OCR_OUTPUT_MARKER",
      provider_payload: "PROVIDER_PAYLOAD_MARKER",
      storage_path: "STORAGE_PATH_MARKER",
      secrets: "SECRET_MARKER",
      uploaded_document_contents: "UPLOADED_DOCUMENT_MARKER"
    } as unknown as CustomerOnboardingProgressInput);
    const rendered = JSON.stringify(progress);

    for (const forbiddenField of SUPPORT_SUCCESS_FORBIDDEN_RAW_CUSTOMER_DATA) {
      expect(rendered, forbiddenField).not.toContain(forbiddenField);
    }

    for (const marker of [
      "RAW_CONTRACT_TEXT_MARKER",
      "FULL_NOTE_MARKER",
      "OCR_OUTPUT_MARKER",
      "PROVIDER_PAYLOAD_MARKER",
      "STORAGE_PATH_MARKER",
      "SECRET_MARKER",
      "UPLOADED_DOCUMENT_MARKER"
    ]) {
      expect(rendered).not.toContain(marker);
    }
  });

  it("keeps customer-facing onboarding copy focused on renewal control instead of adjacent suites", () => {
    const progress = buildCustomerOnboardingProgress(baseInput({ totalContracts: 1 }));
    const copy = [
      progress.customerSafeSummary,
      ...progress.milestones.flatMap((item) => [item.label, item.description])
    ].join("\n");

    expect(copy).not.toMatch(/full CLM/i);
    expect(copy).not.toMatch(/legal advice/i);
    expect(copy).not.toMatch(/negotiation/i);
    expect(copy).not.toMatch(/approval workflow/i);
    expect(copy).not.toMatch(/e-signature/i);
    expect(copy).not.toMatch(/\bCRM\b/i);
    expect(copy).not.toMatch(/health score/i);
    expect(copy).not.toMatch(/support impersonation/i);
  });

  it("keeps onboarding evidence queries organization-scoped, bounded, and payload-free", () => {
    const source = fs.readFileSync(path.join(repoRoot, "lib", "contracts", "kernel-queries.ts"), "utf8");
    const helperSource = source.slice(
      source.indexOf("export async function getCustomerOnboardingQueryEvidence"),
      source.indexOf("export async function getOrganizationContractCount")
    );

    expect(helperSource).toContain('.eq("organization_id", organizationId)');
    expect(helperSource).toContain('select("id", { count: "exact", head: true })');
    expect(helperSource).not.toContain("extracted_text");
    expect(helperSource).not.toContain("body");
    expect(helperSource).not.toContain("provider_payload");
    expect(helperSource).not.toContain("storage_path");
  });
});
