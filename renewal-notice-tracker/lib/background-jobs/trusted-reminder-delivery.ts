import type { BackgroundJob } from "@/lib/background-jobs/job-types";
import { processTrustedReminderDeliveryJob as deliverTrustedReminder } from "@/lib/notifications/reminders";

export type TrustedReminderDeliveryPayload = {
  reminderId: string;
  contractId: string;
  remindAt: string;
};

export function parseTrustedReminderDeliveryPayload(job: BackgroundJob): TrustedReminderDeliveryPayload {
  if (job.job_type !== "trusted_reminder_delivery") {
    throw new Error("Trusted reminder delivery processor received an unsupported job type.");
  }

  const reminderId = job.payload.reminder_id;
  const contractId = job.payload.contract_id;
  const remindAt = job.payload.remind_at;

  if (typeof reminderId !== "string" || !reminderId.trim()) {
    throw new Error("Trusted reminder delivery job payload is missing reminder_id.");
  }
  if (typeof contractId !== "string" || !contractId.trim()) {
    throw new Error("Trusted reminder delivery job payload is missing contract_id.");
  }
  if (typeof remindAt !== "string" || !remindAt.trim()) {
    throw new Error("Trusted reminder delivery job payload is missing remind_at.");
  }

  return {
    reminderId: reminderId.trim(),
    contractId: contractId.trim(),
    remindAt: remindAt.trim()
  };
}

export async function processTrustedReminderDeliveryBackgroundJob(input: {
  job: BackgroundJob;
  workerId: string;
}) {
  const payload = parseTrustedReminderDeliveryPayload(input.job);

  const result = await deliverTrustedReminder({
    organizationId: input.job.organization_id,
    reminderId: payload.reminderId,
    workerId: input.workerId
  });

  return {
    ...result,
    contractId: payload.contractId,
    remindAt: payload.remindAt
  };
}
