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
          topReminderStatuses: [["retry_pending", 1], ["sent", 2]],
          staleProcessingReminders: 1,
          exportJobHealth: {
            queued: 1,
            processing: 1,
            completed: 3,
            failed: 1,
            expired: 1,
            staleProcessing: 1,
            oldestQueuedAgeMinutes: 42,
            oldestProcessingAgeMinutes: 65
          },
          ocrJobHealth: {
            queued: 1,
            processing: 1,
            completed: 2,
            retryPending: 1,
            failedTerminal: 1,
            staleProcessing: 1,
            oldestQueuedAgeMinutes: 12,
            oldestProcessingAgeMinutes: 31
          }
        }}
        debug={{
          failedReminders: [
            {
              id: "rem-1",
              contract_id: "contract-1",
              status: "retry_pending",
              diagnostic_code: "ERR_REMINDER_RETRY_SCHEDULED_001",
              diagnostic_category: "reminder_retry_scheduled",
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
              diagnostic_code: "ERR_NOTIFICATION_DELIVERY_FAILED_001",
              diagnostic_category: "notification_delivery_failed",
              sent_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          extractionFailures: [
            {
              id: "failure-1",
              contract_id: "contract-1",
              stage: "field_extraction",
              diagnostic_code: "ERR_FIELD_EXTRACTION_FAILED_001",
              diagnostic_category: "field_extraction_failed",
              created_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          reminderRuns: [
            {
              id: "run-1",
              reminder_id: "rem-1",
              status: "retry_pending",
              diagnostic_code: "ERR_REMINDER_RETRY_SCHEDULED_001",
              diagnostic_category: "reminder_retry_scheduled",
              created_at: "2026-04-29T08:00:00.000Z"
            }
          ],
          backgroundExports: [
            {
              id: "export-1",
              status: "failed",
              format: "csv",
              requested_at: "2026-04-29T08:00:00.000Z",
              completed_at: null,
              export_preset: "workflow_export",
              row_count: 1200,
              page_count: 2,
              failure_code: "ERR_EXPORT_BACKGROUND_STORAGE_FAILED_001",
              failure_category: "background_export_storage_failed"
            }
          ],
          ocrJobs: [
            {
              id: "ocr-1",
              contract_id: "contract-1",
              status: "retry_pending",
              attempts: 1,
              queued_at: "2026-04-29T08:00:00.000Z",
              started_at: "2026-04-29T08:01:00.000Z",
              completed_at: null,
              diagnostic_code: "ERR_OCR_JOB_RETRY_SCHEDULED_001",
              diagnostic_category: "ocr_job_retry_scheduled"
            }
          ],
          importJobs: [
            {
              id: "job-1",
              file_name: "import.csv",
              status: "completed_with_errors",
              diagnostic_code: "ERR_IMPORT_JOB_NEEDS_RESCUE_001",
              diagnostic_category: "import_job_needs_rescue",
              created_at: "2026-04-29T08:00:00.000Z",
              row_count: 3,
              imported_count: 2
            }
          ]
        }}
        billing={{
          providerLabel: "PayPal support-led exception",
          planTier: "growth",
          status: "past_due",
          currentPeriodEnd: "2026-05-01T00:00:00.000Z",
          issues: [
            "Workspace is on a support-led billing exception path.",
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
    expect(screen.getByRole("heading", { name: "Background export job health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OCR job health" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operational traces" })).toBeInTheDocument();
    expect(screen.getByText(/ERR_EXPORT_BACKGROUND_STORAGE_FAILED_001/i)).toBeInTheDocument();
    expect(screen.getByText(/ERR_OCR_JOB_RETRY_SCHEDULED_001/i)).toBeInTheDocument();
    expect(screen.getByText(/ERR_IMPORT_JOB_NEEDS_RESCUE_001/i)).toBeInTheDocument();
    expect(screen.getByText(/completed_with_errors/i)).toBeInTheDocument();
    expect(screen.getAllByText(/PayPal support-led exception/i).length).toBeGreaterThan(0);

    expect(screen.queryByText("Unified profitability blueprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Operational readiness and capacity")).not.toBeInTheDocument();
    expect(screen.queryByText("Organization health and churn risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Breadth governance")).not.toBeInTheDocument();
    expect(screen.getByText("Reminder reruns require Internal Admin approval.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rerun reminder" })).not.toBeInTheDocument();
    expect(screen.queryByText(/raw contract text/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidential renewal clause/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SMTP timeout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Mailbox rejected message/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Unable to extract notice deadline/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/OCR processing failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Row 2 failed/i)).not.toBeInTheDocument();
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
              diagnostic_code: "ERR_REMINDER_RETRY_SCHEDULED_001",
              diagnostic_category: "reminder_retry_scheduled",
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
