import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminPanel } from "@/components/admin/admin-panel";

describe("AdminPanel", () => {
  it("renders only operational sections for internal rescue work", () => {
    render(
      <AdminPanel
        internalRole="internal_support"
        organizationId="11111111-1111-4111-8111-111111111111"
        snapshot={{
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
          providerLabel: "Manual invoice exception or legacy-disabled provider",
          planTier: "growth",
          status: "past_due",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          issues: [
            "Workspace is on a manual invoice exception or legacy-disabled billing path.",
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
    expect(screen.getAllByText(/manual invoice exception or legacy-disabled provider/i).length).toBeGreaterThan(0);

    expect(screen.queryByText("Unified profitability blueprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational readiness and capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Organization health and churn risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Breadth governance")).not.toBeInTheDocument();
    expect(screen.getByText("Reminder reruns require Internal Admin approval.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rerun reminder" })).not.toBeInTheDocument();
  });

  it("shows rerun reminder controls only to internal admins", () => {
    render(
      <AdminPanel
        internalRole="internal_admin"
        organizationId="11111111-1111-4111-8111-111111111111"
        snapshot={{
          failedReminders: 1,
          retryPendingReminders: 1,
          processingReminders: 0,
          cancelledReminders: 0,
          failedNotifications: 0,
          duplicateSuppressedNotifications: 0,
          contractsNeedingReview: 0,
          extractionFailureCount: 0,
          retryScheduledRuns: 0,
          terminalFailureRuns: 0,
          topReminderStatuses: [["retry_pending", 1]]
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
          notificationLogs: [],
          extractionFailures: [],
          reminderRuns: [],
          importJobs: []
        }}
        billing={{
          providerLabel: "Paddle",
          planTier: "starter",
          status: "active",
          currentPeriodEnd: null,
          issues: []
        }}
        privacyTraces={null}
      />
    );

    expect(screen.getByRole("button", { name: "Rerun reminder" })).toBeInTheDocument();
  });
});
