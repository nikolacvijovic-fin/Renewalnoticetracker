import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReminderEmailActionToken } from "@/lib/email/action-tokens";

const createAdminSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

function buildAdminClient(input?: {
  reminderOrgId?: string;
  contractOrgId?: string;
  cycleStatus?: string | null;
  lastAcknowledgedAt?: string | null;
  allowedRecipients?: string[];
}) {
  const state = {
    contractUpdates: [] as Array<Record<string, unknown>>
  };

  const reminderOrgId = input?.reminderOrgId ?? "org-1";
  const contractOrgId = input?.contractOrgId ?? reminderOrgId;
  const reminder = {
    id: "reminder-1",
    organization_id: reminderOrgId,
    contract_id: "contract-1",
    recipient_email: "owner@example.com",
    recipient_emails: input?.allowedRecipients ?? ["owner@example.com"],
    contracts: {
      id: "contract-1",
      organization_id: contractOrgId,
      cycle_status: input?.cycleStatus ?? "awaiting_acknowledgment",
      last_acknowledged_at: input?.lastAcknowledgedAt ?? null,
      last_acknowledged_by: null
    }
  };

  return {
    state,
    client: {
      from(table: string) {
        if (table === "reminders") {
          return {
            select() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        async maybeSingle() {
                          return { data: reminder, error: null };
                        }
                      };
                    }
                  };
                }
              };
            }
          };
        }

        if (table === "contracts") {
          return {
            update(payload: Record<string, unknown>) {
              state.contractUpdates.push(payload);
              return {
                eq() {
                  return {
                    eq() {
                      return Promise.resolve({ error: null });
                    }
                  };
                }
              };
            }
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }
    }
  };
}

describe("reminder email actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges through a signed token and stays idempotent", async () => {
    const { client, state } = buildAdminClient();
    createAdminSupabaseClient.mockReturnValue(client);

    const { executeReminderEmailAction } = await import("@/lib/email/actions");
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "acknowledge",
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    const firstResult = await executeReminderEmailAction(
      token,
      "acknowledge",
      new Date("2030-01-01T00:00:00.000Z")
    );

    expect(firstResult.status).toBe("acknowledged");
    expect(state.contractUpdates).toContainEqual(
      expect.objectContaining({
        cycle_status: "awaiting_decision",
        last_acknowledged_by: null
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.acknowledged_from_email",
        organizationId: "org-1",
        contractId: "contract-1"
      })
    );

    const secondClient = buildAdminClient({
      lastAcknowledgedAt: "2030-01-01T00:00:00.000Z"
    });
    createAdminSupabaseClient.mockReturnValueOnce(secondClient.client);

    const secondResult = await executeReminderEmailAction(
      token,
      "acknowledge",
      new Date("2030-01-01T01:00:00.000Z")
    );

    expect(secondResult.status).toBe("already_acknowledged");
    expect(secondClient.state.contractUpdates).toHaveLength(0);
  });

  it("denies tokens when the org does not match the reminder record", async () => {
    const { client } = buildAdminClient({ reminderOrgId: "org-foreign" });
    createAdminSupabaseClient.mockReturnValue(client);

    const { executeReminderEmailAction, ReminderEmailActionAccessError } = await import(
      "@/lib/email/actions"
    );
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "acknowledge",
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    await expect(
      executeReminderEmailAction(token, "acknowledge", new Date("2030-01-01T00:00:00.000Z"))
    ).rejects.toThrowError(ReminderEmailActionAccessError);
  });

  it("does not let a decision token perform acknowledgment", async () => {
    const { client } = buildAdminClient();
    createAdminSupabaseClient.mockReturnValue(client);

    const { executeReminderEmailAction, ReminderEmailActionTokenError } = await import(
      "@/lib/email/actions"
    );
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "decision",
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    await expect(
      executeReminderEmailAction(token, "acknowledge", new Date("2030-01-01T00:00:00.000Z"))
    ).rejects.toThrowError(ReminderEmailActionTokenError);
  });

  it("decision links only redirect and never acknowledge through reply-to semantics", async () => {
    const { client, state } = buildAdminClient();
    createAdminSupabaseClient.mockReturnValue(client);

    const { executeReminderEmailAction } = await import("@/lib/email/actions");
    const token = createReminderEmailActionToken({
      organizationId: "org-1",
      recipientIdentity: "owner@example.com",
      contractId: "contract-1",
      reminderId: "reminder-1",
      action: "decision",
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    const result = await executeReminderEmailAction(
      token,
      "decision",
      new Date("2030-01-01T00:00:00.000Z")
    );

    expect(result).toEqual({
      status: "redirect",
      contractUrl: "http://localhost:3000/dashboard/contracts/contract-1"
    });
    expect(state.contractUpdates).toHaveLength(0);
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
