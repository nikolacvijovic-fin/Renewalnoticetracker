import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit";
import { trackServerAnalyticsEvent } from "@/lib/analytics/events";
import { getAppConfig } from "@/lib/config";
import {
  type Phase1EmailAction,
  ReminderEmailActionTokenError,
  validateReminderEmailActionToken
} from "@/lib/email/action-tokens";

type JoinedReminderRecord = {
  id: string;
  organization_id: string;
  contract_id: string;
  recipient_email: string;
  recipient_emails: unknown;
  contracts:
    | {
        id: string;
        organization_id: string;
        cycle_status: string | null;
        last_acknowledged_at: string | null;
        last_acknowledged_by: string | null;
      }
    | Array<{
        id: string;
        organization_id: string;
        cycle_status: string | null;
        last_acknowledged_at: string | null;
        last_acknowledged_by: string | null;
      }>
    | null;
};

type ReminderContractRow = {
  id: string;
  organization_id: string;
  cycle_status: string | null;
  last_acknowledged_at: string | null;
  last_acknowledged_by: string | null;
};

export class ReminderEmailActionAccessError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ReminderEmailActionAccessError";
  }
}

function getContractRow(reminder: JoinedReminderRecord): ReminderContractRow | null {
  return Array.isArray(reminder.contracts) ? reminder.contracts[0] ?? null : reminder.contracts;
}

function getRecipientIdentities(reminder: JoinedReminderRecord) {
  const extraRecipients = Array.isArray(reminder.recipient_emails)
    ? reminder.recipient_emails.map(String)
    : [];

  return new Set(
    [reminder.recipient_email, ...extraRecipients]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function buildContractUrl(contractId: string) {
  return `${getAppConfig().public.appUrl}/dashboard/contracts/${contractId}`;
}

export async function executeReminderEmailAction(
  token: string,
  expectedAction: Phase1EmailAction,
  now = new Date()
) {
  const payload = validateReminderEmailActionToken(token, expectedAction, now);
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("reminders")
    .select(
      `
      id,
      organization_id,
      contract_id,
      recipient_email,
      recipient_emails,
      contracts (
        id,
        organization_id,
        cycle_status,
        last_acknowledged_at,
        last_acknowledged_by
      )
    `
    )
    .eq("id", payload.reminderId)
    .eq("organization_id", payload.organizationId)
    .maybeSingle();

  if (error) {
    throw new ReminderEmailActionAccessError("Email action could not be completed.", 400);
  }

  const typedReminder = (data as JoinedReminderRecord | null) ?? null;

  if (!typedReminder?.id) {
    throw new ReminderEmailActionAccessError("Email action could not be completed.", 403);
  }

  const contract = getContractRow(typedReminder);

  if (
    typedReminder.contract_id !== payload.contractId ||
    typedReminder.organization_id !== payload.organizationId ||
    !contract?.id ||
    contract.id !== payload.contractId ||
    contract.organization_id !== payload.organizationId
  ) {
    throw new ReminderEmailActionAccessError("Email action could not be completed.", 403);
  }

  if (!getRecipientIdentities(typedReminder).has(payload.recipientIdentity)) {
    throw new ReminderEmailActionAccessError("Email action could not be completed.", 403);
  }

  if (expectedAction === "decision") {
    return {
      status: "redirect" as const,
      contractUrl: buildContractUrl(payload.contractId)
    };
  }

  if (contract.last_acknowledged_at) {
    return {
      status: "already_acknowledged" as const,
      contractUrl: buildContractUrl(payload.contractId)
    };
  }

  const acknowledgedAt = now.toISOString();
  const updateResult = await admin
    .from("contracts")
    .update({
      cycle_status: "awaiting_decision",
      last_acknowledged_at: acknowledgedAt,
      last_acknowledged_by: null
    })
    .eq("id", payload.contractId)
    .eq("organization_id", payload.organizationId);

  if (updateResult.error) {
    throw new ReminderEmailActionAccessError("Email action could not be completed.", 400);
  }

  await createAuditLog({
    organizationId: payload.organizationId,
    contractId: payload.contractId,
    action: "contract.acknowledged_from_email",
    entityType: "reminder",
    entityId: payload.reminderId,
    details: {
      acknowledged_at: acknowledgedAt,
      recipient_identity: payload.recipientIdentity,
      source: "signed_email_link"
    }
  });

  await trackServerAnalyticsEvent({
    organizationId: payload.organizationId,
    eventName: "acknowledgment_recorded",
    sourceOfTruth: "event_and_state",
    idempotencyKey: `acknowledgment_recorded:email:${payload.reminderId}`,
    properties: {
      contract_id: payload.contractId,
      reminder_id: payload.reminderId,
      source: "email_link"
    }
  });

  return {
    status: "acknowledged" as const,
    contractUrl: buildContractUrl(payload.contractId)
  };
}

export { ReminderEmailActionTokenError };
