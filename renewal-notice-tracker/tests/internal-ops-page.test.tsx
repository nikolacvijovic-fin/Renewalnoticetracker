import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireInternalRole = vi.fn();
const getAdminOperationalSnapshot = vi.fn();
const getAdminDebugData = vi.fn();
const getOrganizationBilling = vi.fn();
const getPrivacyOperationsSnapshot = vi.fn();
const AdminPanel = vi.fn(() => <div>internal-panel</div>);

vi.mock("@/lib/internal-access", () => ({
  requireInternalRole
}));

vi.mock("@/lib/internal/ops-queries", () => ({
  getAdminOperationalSnapshot,
  getAdminDebugData,
  getOrganizationBilling,
  getPrivacyOperationsSnapshot
}));

vi.mock("@/components/admin/admin-panel", () => ({
  AdminPanel
}));

describe("internal ops page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies non-internal access before loading ops data", async () => {
    requireInternalRole.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const Page = (await import("@/app/internal/ops/page")).default;

    await expect(Page({ searchParams: { organizationId: "org-1" } })).rejects.toThrow("REDIRECT:/dashboard");
    expect(getAdminOperationalSnapshot).not.toHaveBeenCalled();
    expect(getAdminDebugData).not.toHaveBeenCalled();
    expect(getOrganizationBilling).not.toHaveBeenCalled();
    expect(getPrivacyOperationsSnapshot).not.toHaveBeenCalled();
  });

  it("loads only minimal operational datasets for internal ops", async () => {
    requireInternalRole.mockResolvedValue(undefined);
    getAdminOperationalSnapshot.mockResolvedValue({
      totalContracts: 1,
      totalReminders: 1,
      sentLast7Days: 0,
      sentLast30Days: 0,
      failedReminders: 0,
      retryPendingReminders: 0,
      processingReminders: 0,
      cancelledReminders: 0,
      failedNotifications: 0,
      duplicateSuppressedNotifications: 0,
      contractsNeedingReview: 0,
      extractionFailureCount: 0,
      retryScheduledRuns: 0,
      terminalFailureRuns: 0,
      topReminderStatuses: []
    });
    getAdminDebugData.mockResolvedValue({
      failedReminders: [],
      notificationLogs: [],
      extractionFailures: [],
      reminderRuns: [],
      importJobs: []
    });
    getOrganizationBilling.mockResolvedValue({
      billing_provider: "paddle",
      plan_tier: "starter",
      billing_subscription_status: "active",
      subscription_status: "active",
      billing_current_period_end: null,
      subscription_current_period_end: null,
      billing_subscription_id: "sub_123"
    });
    getPrivacyOperationsSnapshot.mockResolvedValue({
      exportRequests30d: 0,
      openDeletionRequests: 0,
      latestExportAt: null,
      latestDeletionRequestAt: null,
      latestBackupCheckAt: null,
      latestBackupStatus: null,
      latestRestoreTestedAt: null,
      blockers: [],
      warnings: []
    });

    const Page = (await import("@/app/internal/ops/page")).default;
    render(await Page({ searchParams: { organizationId: "org-1" } }));

    expect(getAdminOperationalSnapshot).toHaveBeenCalledWith("org-1");
    expect(getAdminDebugData).toHaveBeenCalledWith("org-1");
    expect(getOrganizationBilling).toHaveBeenCalledWith("org-1");
    expect(getPrivacyOperationsSnapshot).toHaveBeenCalledWith("org-1");
    expect(AdminPanel).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      expect.anything()
    );
    expect(screen.getByText("internal-panel")).toBeInTheDocument();
  });
});
