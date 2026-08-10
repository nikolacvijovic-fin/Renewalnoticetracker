import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BETA_RELIABILITY_EVENT_CONTRACTS,
  buildBetaOrganizationReliabilitySummary,
  buildBetaSupportNoteInsert,
  buildFounderBetaReliabilityDashboard,
  sanitizeBetaSupportNoteMetadata
} from "@/lib/internal/beta-reliability";

const repoRoot = process.cwd();

function baseInput(overrides: Partial<Parameters<typeof buildBetaOrganizationReliabilitySummary>[0]["metrics"]> = {}) {
  return {
    organizationId: "org-1",
    organizationName: "Acme Finance",
    createdAt: "2026-08-01T00:00:00.000Z",
    metrics: {
      contractCount: 0,
      pdfUploadCount: 0,
      extractionSuccessCount: 0,
      extractionFailureCount: 0,
      contractsNeedingReviewCount: 0,
      trustedNoticeDeadlinesCount: 0,
      urgentDeadlineCount: 0,
      ownerAssignmentCount: 0,
      reminderEmailSuccessCount: 0,
      reminderEmailFailureCount: 0,
      calendarExportCount: 0,
      decisionCount: 0,
      ...overrides
    }
  };
}

describe("founder beta reliability dashboard", () => {
  it("calculates activation stage and stuck reason for empty beta organizations", () => {
    const summary = buildBetaOrganizationReliabilitySummary(baseInput());

    expect(summary.currentStage).toBe("signed_up");
    expect(summary.completedSteps).toEqual(["signed_up"]);
    expect(summary.stuckReason).toBe("no_contract_uploaded");
    expect(summary.nextRecommendedFounderAction).toContain("upload their first contract");
  });

  it("counts extraction failures, reminder failures, and contracts needing review", () => {
    const summary = buildBetaOrganizationReliabilitySummary(
      baseInput({
        contractCount: 2,
        pdfUploadCount: 2,
        extractionFailureCount: 1,
        contractsNeedingReviewCount: 2,
        lowConfidenceCriticalFieldCount: 1,
        reminderEmailFailureCount: 1
      })
    );

    expect(summary.stuckReason).toBe("extraction_failed");
    expect(summary.metrics.extractionFailureCount).toBe(1);
    expect(summary.metrics.contractsNeedingReviewCount).toBe(2);
    expect(summary.metrics.reminderEmailFailureCount).toBe(1);
  });

  it("marks organizations activated only after deadline, owner, reminder, and decision signals exist", () => {
    const summary = buildBetaOrganizationReliabilitySummary(
      baseInput({
        contractCount: 1,
        pdfUploadCount: 1,
        extractionSuccessCount: 1,
        trustedNoticeDeadlinesCount: 1,
        ownerAssignmentCount: 1,
        reminderEmailSuccessCount: 1,
        calendarExportCount: 1,
        decisionCount: 1
      })
    );

    expect(summary.currentStage).toBe("activated");
    expect(summary.stuckReason).toBeNull();
    expect(summary.activationCompletionPercent).toBe(100);
  });

  it("orders stalled organizations before healthy organizations and totals beta risk", () => {
    const dashboard = buildFounderBetaReliabilityDashboard(
      [
        baseInput({
          contractCount: 1,
          pdfUploadCount: 1,
          extractionSuccessCount: 1,
          trustedNoticeDeadlinesCount: 1,
          ownerAssignmentCount: 1,
          reminderEmailSuccessCount: 1,
          decisionCount: 1,
          lastActivityAt: "2026-08-08T00:00:00.000Z"
        }),
        {
          ...baseInput({ contractCount: 1, pdfUploadCount: 1, contractsNeedingReviewCount: 1, urgentDeadlineCount: 1 }),
          organizationId: "org-2",
          organizationName: "Beta Co"
        }
      ],
      "2026-08-09T00:00:00.000Z"
    );

    expect(dashboard.organizations[0]?.organizationId).toBe("org-2");
    expect(dashboard.totals).toMatchObject({
      organizationCount: 2,
      activatedCount: 1,
      stalledCount: 1,
      contractsNeedingReviewCount: 1,
      urgentDeadlineCount: 1
    });
  });

  it("strips unsafe support diagnostic metadata and note content", () => {
    const metadata = sanitizeBetaSupportNoteMetadata({
      organizationId: "org-1",
      contractId: "contract-1",
      stage: "extraction_failed",
      rawContractText: "raw contract text should never survive",
      provider_payload: { token: "secret_token" },
      privateNote: "private note",
      email_body: "email body",
      storagePath: "storage/contracts/acme.pdf",
      failureCode: "ocr_failed",
      debugTrace: "stack trace"
    });
    const note = buildBetaSupportNoteInsert({
      organizationId: "org-1",
      contractId: "contract-1",
      issueType: "extraction_failed",
      safeNote: "Customer sees OCR output and private note marker.",
      createdByUserId: "support-1",
      metadata
    });

    const serialized = JSON.stringify({ metadata, note });
    expect(metadata).toEqual({
      organizationId: "org-1",
      contractId: "contract-1",
      stage: "extraction_failed",
      failureCode: "ocr_failed"
    });
    expect(note.safe_note).toContain("[redacted]");
    expect(serialized).not.toContain("raw contract text");
    expect(serialized).not.toContain("secret_token");
    expect(serialized).not.toContain("storage/contracts");
    expect(serialized).not.toContain("email body");
  });

  it("keeps the beta reliability repository bounded and free of raw customer-content selects", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "lib", "internal", "repositories", "admin-beta-reliability-repository.ts"),
      "utf8"
    );
    const forbiddenColumns = [
      "extracted_text",
      "storage_path",
      "file_name",
      "error_message",
      "provider_payload",
      "recipient_email",
      "details,"
    ];

    expect(source).toContain(".limit(organizationLimit)");
    expect(source).toContain('.in("organization_id", organizationIds)');
    expect(source).toContain('.select("id,contract_id,mime_type,ocr_status,ocr_confidence,uploaded_at,uploaded_by")');
    for (const column of forbiddenColumns) {
      expect(source).not.toContain(column);
    }
  });

  it("creates support-note schema with closed customer RLS and contract scope enforcement", () => {
    const migration = fs.readFileSync(
      path.join(repoRoot, "supabase", "migrations", "202608090003_beta_support_notes.sql"),
      "utf8"
    );

    expect(migration).toContain("create table if not exists public.beta_support_notes");
    expect(migration).toContain("alter table public.beta_support_notes enable row level security");
    expect(migration).toContain("using (false)");
    expect(migration).toContain("with check (false)");
    expect(migration).toContain("enforce_beta_support_note_contract_scope");
    expect(migration).toContain("contracts.organization_id = new.organization_id");
  });

  it("defines beta reliability event contracts without pretending to emit fake telemetry", () => {
    expect(BETA_RELIABILITY_EVENT_CONTRACTS).toEqual([
      "beta.organization_signed_up",
      "beta.activation_step_completed",
      "beta.activation_stalled",
      "beta.upload_failed",
      "beta.extraction_failed",
      "beta.reminder_failed",
      "beta.email_test_failed",
      "beta.help_requested",
      "beta.support_note_resolved"
    ]);

    const source = fs.readFileSync(path.join(repoRoot, "lib", "internal", "beta-reliability.ts"), "utf8");
    expect(source).not.toContain("trackServerAnalyticsEvent");
    expect(source).not.toContain("recordAuditLog");
  });
});
