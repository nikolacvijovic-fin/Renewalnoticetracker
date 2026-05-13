"use server";

import { revalidatePath } from "next/cache";
import { requireInternalActionAccess } from "@/lib/internal-access";
import { resendNotificationSchema, rerunReminderSchema } from "@/lib/validation/admin";
import { resendNotificationByLogId, rerunReminderJob } from "@/lib/notifications/reminders";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";

export async function resendNotificationAction(formData: FormData) {
  const payload = resendNotificationSchema.parse({
    notification_log_id: formData.get("notification_log_id"),
    organization_id: formData.get("organization_id")
  });
  const { user, organizationId, role } = await requireInternalActionAccess(
    "internal_rescue_actions",
    payload.organization_id
  );

  await resendNotificationByLogId(payload.notification_log_id, organizationId);
  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "admin.notification_resent",
    entityType: "notification",
    entityId: payload.notification_log_id,
    details: { ...payload, internal_role: role }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "internal_rescue_action_recorded",
    sourceOfTruth: "event",
    idempotencyKey: `internal_rescue_action_recorded:resend:${payload.notification_log_id}`,
    properties: {
      action: "resend_notification",
      notification_log_id: payload.notification_log_id,
      internal_role: role
    }
  });

  revalidatePath(`/internal/ops?organizationId=${organizationId}`);
}

export async function rerunReminderAction(formData: FormData) {
  const payload = rerunReminderSchema.parse({
    reminder_id: formData.get("reminder_id"),
    organization_id: formData.get("organization_id")
  });
  const { user, organizationId, role } = await requireInternalActionAccess(
    "internal_rescue_actions",
    payload.organization_id
  );

  await rerunReminderJob(payload.reminder_id, organizationId);
  await createAuditLog({
    organizationId,
    actorUserId: user.id,
    action: "admin.reminder_rerun",
    entityType: "reminder",
    entityId: payload.reminder_id,
    details: { ...payload, internal_role: role }
  });

  await trackServerAnalyticsEvent({
    organizationId,
    actorUserId: user.id,
    eventName: "internal_rescue_action_recorded",
    sourceOfTruth: "event",
    idempotencyKey: `internal_rescue_action_recorded:rerun:${payload.reminder_id}`,
    properties: {
      action: "rerun_reminder",
      reminder_id: payload.reminder_id,
      internal_role: role
    }
  });

  revalidatePath(`/internal/ops?organizationId=${organizationId}`);
}
