import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPanel } from "@/components/admin/admin-panel";

describe("AdminPanel", () => {
  it("renders only operational sections for internal rescue work", () => {
    render(
      <AdminPanel
        organizationId="11111111-1111-4111-8111-111111111111"
        snapshot={{
          totalContracts: 1,
          totalReminders: 3,
          sentLast7Days: 1,
          sentLast30Days: 2,
          failedReminders: 1,
          retryPendingReminders: 1,
          processingReminders: 0,
          cancelledReminders: 0,
          failedNotifications: 1,
          duplicateSuppressedNotifications: 1,
          contractsNeedingReview: 2,
          extractionFailureCount: 1,
          retryScheduledRuns: 1,
          terminalFailureRuns: 0,
          topReminderStatuses: [["retry_pending", 1], ["sent", 2]]
        }}
        debug={{
          failedReminders: [
            {
              id: "rem-1",
              contract_id: "contract-1",
              status: "retry_pending",
              last_error: "SMTP timeout",
              attempt_count: 2,
              next_retry_at: "2026-04-30T08:00:00.000Z"
            }
          ],
          notificationLogs: [
            {
              id: "log-1",
              reminder_id: "rem-1",
              channel: "email",
              status: "failed",
              recipient_email: "op***@example.com",
              destination: "owner@example.com",
              error_message: "Mailbox rejected message",
              sent_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          extractionFailures: [
            {
              id: "failure-1",
              contract_id: "contract-1",
              stage: "field_extraction",
              error_message: "Unable to extract notice deadline",
              created_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          reminderRuns: [
            {
              id: "run-1",
              reminder_id: "rem-1",
              status: "retry_pending",
              error_message: "SMTP timeout",
              created_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          importJobs: [
            {
              id: "job-1",
              file_name: "import.csv",
              status: "completed_with_errors",
              error_message: "Row 2 failed",
              created_at: "2026-04-29T08:00:00.000Z",
              row_count: 3,
              imported_count: 2
            }
          ]
        }}
        billing={{
          providerLabel: "Manual invoice or legacy migration",
          planTier: "growth",
          status: "past_due",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          issues: [
            "Workspace is on manual invoice or legacy migration billing.",
            "Subscription status past_due needs support follow-up."
          ]
        }}
        privacyTraces={{
          exportRequests30d: 2,
          openDeletionRequests: 1,
          latestExportAt: "2026-04-29T08:00:00.000Z",
          latestDeletionRequestAt: "2026-04-29T07:00:00.000Z",
          latestBackupCheckAt: "2026-04-29T06:00:00.000Z",
          latestBackupStatus: "healthy",
          latestRestoreTestedAt: "2026-04-28T08:00:00.000Z",
          blockers: [],
          warnings: ["Restore evidence is older than seven days."]
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Operational overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reminder delivery health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Billing exceptions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failed reminder jobs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent notification attempts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Extraction failures" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent import jobs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Recent reminder lifecycle events" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operational traces" })).toBeInTheDocument();
    expect(screen.getByText(/completed_with_errors/i)).toBeInTheDocument();
    expect(screen.getAllByText(/manual invoice or legacy migration/i).length).toBeGreaterThan(0);

    expect(screen.queryByText("Unified profitability blueprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational readiness and capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Organization health and churn risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Breadth governance")).not.toBeInTheDocument();
  });
});
