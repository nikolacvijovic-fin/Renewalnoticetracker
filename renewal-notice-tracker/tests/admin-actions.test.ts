import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrgPermission = vi.fn();
const requireInternalActionAccess = vi.fn();
const resendNotificationByLogId = vi.fn();
const rerunReminderJob = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/internal-access", () => ({
  requireInternalActionAccess
}));

vi.mock("@/lib/notifications/reminders", () => ({
  resendNotificationByLogId,
  rerunReminderJob
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireInternalActionAccess.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "internal_support"
    });
  });

  it("binds resend notification actions to the active organization", async () => {
    const { resendNotificationAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("notification_log_id", "11111111-1111-4111-8111-111111111111");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await resendNotificationAction(formData);

    expect(resendNotificationByLogId).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "org-1"
    );
    expect(requireInternalActionAccess).toHaveBeenCalledWith(
      "internal_rescue_actions",
      "11111111-1111-4111-8111-111111111111"
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        entityId: "11111111-1111-4111-8111-111111111111",
        action: "admin.notification_resent"
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/internal/ops?organizationId=org-1");
  });

  it("fails resend notification explicitly when the audit write fails", async () => {
    createAuditLog.mockRejectedValueOnce(new Error("audit failed"));
    const { resendNotificationAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("notification_log_id", "11111111-1111-4111-8111-111111111111");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await expect(resendNotificationAction(formData)).rejects.toThrow("audit failed");
    expect(trackServerAnalyticsEvent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("blocks resend notification abuse when the caller lacks rescue permissions", async () => {
    requireInternalActionAccess.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const { resendNotificationAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("notification_log_id", "11111111-1111-4111-8111-111111111111");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await expect(resendNotificationAction(formData)).rejects.toThrow("REDIRECT:/dashboard");
    expect(resendNotificationByLogId).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("binds rerun reminder actions to the active organization", async () => {
    requireInternalActionAccess.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "internal_admin"
    });
    const { rerunReminderAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("reminder_id", "22222222-2222-4222-8222-222222222222");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await rerunReminderAction(formData);

    expect(rerunReminderJob).toHaveBeenCalledWith(
      "22222222-2222-4222-8222-222222222222",
      "org-1"
    );
    expect(requireInternalActionAccess).toHaveBeenCalledWith(
      "internal_rescue_actions",
      "11111111-1111-4111-8111-111111111111",
      { allowedRoles: ["internal_admin"] }
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        entityId: "22222222-2222-4222-8222-222222222222",
        action: "admin.reminder_rerun"
      })
    );
  });

  it("fails reminder rerun explicitly when the audit write fails", async () => {
    requireInternalActionAccess.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "internal_admin"
    });
    createAuditLog.mockRejectedValueOnce(new Error("audit failed"));
    const { rerunReminderAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("reminder_id", "22222222-2222-4222-8222-222222222222");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await expect(rerunReminderAction(formData)).rejects.toThrow("audit failed");
    expect(trackServerAnalyticsEvent).not.toHaveBeenCalled();
  });

  it("keeps reminder reruns out of internal support hands", async () => {
    requireInternalActionAccess.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const { rerunReminderAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("reminder_id", "22222222-2222-4222-8222-222222222222");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await expect(rerunReminderAction(formData)).rejects.toThrow("REDIRECT:/dashboard");
    expect(rerunReminderJob).not.toHaveBeenCalled();
  });

  it("blocks rerun abuse when the caller lacks rescue permissions", async () => {
    requireInternalActionAccess.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const { rerunReminderAction } = await import("@/lib/actions/admin");
    const formData = new FormData();
    formData.append("reminder_id", "22222222-2222-4222-8222-222222222222");
    formData.append("organization_id", "11111111-1111-4111-8111-111111111111");

    await expect(rerunReminderAction(formData)).rejects.toThrow("REDIRECT:/dashboard");
    expect(rerunReminderJob).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
