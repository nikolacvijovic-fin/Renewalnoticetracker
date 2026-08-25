import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireInternalRole = vi.fn();
const getFounderBetaReliabilityDashboard = vi.fn();
const getFounderEvidenceReadinessSummary = vi.fn();

vi.mock("@/lib/internal-access", () => ({
  requireInternalRole
}));

vi.mock("@/lib/internal/repositories/admin-beta-reliability-repository", () => ({
  getFounderBetaReliabilityDashboard
}));

vi.mock("@/lib/evidence-readiness/evidence-readiness-service", () => ({
  getFounderEvidenceReadinessSummary
}));

describe("founder beta health page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies regular users before loading cross-organization health data", async () => {
    requireInternalRole.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const Page = (await import("@/app/admin/beta-health/page")).default;

    await expect(Page({})).rejects.toThrow("REDIRECT:/dashboard");
    expect(getFounderBetaReliabilityDashboard).not.toHaveBeenCalled();
  }, 15000);

  it("renders internal beta health summaries without customer-sensitive content", async () => {
    requireInternalRole.mockResolvedValue({ role: "internal_support" });
    getFounderEvidenceReadinessSummary.mockResolvedValue({
      averageReadinessScore: 62,
      blockedContractCount: 1,
      commonMissingEvidence: [{ category: "renewal_timing", count: 2 }],
      staleProviderConnectionCount: 1,
      unreviewedExtractionBacklogCount: 2,
      approachingDeadlineWithoutReadyEvidenceCount: 1,
      averageUploadToDecisionReadyHours: null
    });
    getFounderBetaReliabilityDashboard.mockResolvedValue({
      generatedAt: "2026-08-09T00:00:00.000Z",
      totals: {
        organizationCount: 1,
        activatedCount: 0,
        stalledCount: 1,
        extractionFailureCount: 1,
        reminderEmailFailureCount: 1,
        contractsNeedingReviewCount: 2,
        urgentDeadlineCount: 1
      },
      feedback: {
        openCount: 1,
        urgentCount: 1,
        byType: { deadline_incorrect: 1 },
        byOrganization: { "Acme Finance": 1 },
        latest: [
          {
            id: "feedback-1",
            organizationId: "org-1",
            organizationName: "Acme Finance",
            contractId: "contract-1",
            entityType: "contract_metadata",
            entityId: "contract-1",
            submittedByUserId: "user-1",
            feedbackType: "deadline_incorrect",
            severity: "urgent",
            status: "open",
            messagePreview: "Deadline looks wrong",
            createdAt: "2026-08-08T00:00:00.000Z"
          }
        ]
      },
      organizations: [
        {
          organizationId: "org-1",
          organizationName: "Acme Finance",
          createdAt: "2026-08-01T00:00:00.000Z",
          currentStage: "reviewed_deadline",
          completedSteps: ["signed_up", "uploaded_contract", "extraction_completed", "reviewed_deadline"],
          activationCompletionPercent: 44,
          stuckReason: "no_owner_assigned",
          nextRecommendedFounderAction: "Ask the customer to assign an internal owner for the renewal.",
          assistActions: [
            {
              label: "Open internal ops",
              href: "/internal/ops?organizationId=org-1",
              reason: "no_owner_assigned"
            }
          ],
          metrics: {
            contractCount: 2,
            pdfUploadCount: 2,
            extractionSuccessCount: 1,
            extractionFailureCount: 1,
            contractsNeedingReviewCount: 2,
            trustedNoticeDeadlinesCount: 1,
            urgentDeadlineCount: 1,
            ownerAssignmentCount: 0,
            reminderEmailSuccessCount: 0,
            reminderEmailFailureCount: 1,
            calendarExportCount: 0,
            decisionCount: 0,
            lowConfidenceCriticalFieldCount: 1,
            failedUploadCount: 0,
            ocrFailureCount: 0,
            skippedReminderCount: 0,
            duplicateReminderConflictCount: 0,
            sampleContractCount: 0,
            sampleExploredCount: 0,
            sampleDiagnosticIssueCount: 0,
            lastActivityAt: "2026-08-08T00:00:00.000Z"
          }
        }
      ]
    });

    const Page = (await import("@/app/admin/beta-health/page")).default;
    const { container } = render(await Page({}));

    expect(requireInternalRole).toHaveBeenCalledWith(["internal_admin", "internal_support"]);
    expect(getFounderBetaReliabilityDashboard).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Beta Reliability Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Customer feedback loop")).toBeInTheDocument();
    expect(screen.getByText("Common evidence gaps")).toBeInTheDocument();
    expect(screen.getByText("62/100")).toBeInTheDocument();
    expect(screen.getByText("Deadline looks wrong")).toBeInTheDocument();
    expect(screen.getAllByText("Acme Finance").length).toBeGreaterThan(0);
    expect(screen.getByText("Ask the customer to assign an internal owner for the renewal.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open internal ops" })).toHaveAttribute(
      "href",
      "/internal/ops?organizationId=org-1"
    );

    const html = container.innerHTML;
    expect(html).not.toContain("raw contract");
    expect(html).not.toContain("provider payload");
    expect(html).not.toContain("private note");
    expect(html).not.toContain("recipient@example.com");
  });
});
