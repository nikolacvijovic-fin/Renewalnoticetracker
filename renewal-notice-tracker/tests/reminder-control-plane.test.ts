import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const sendReminderEmail = vi.fn();
const updateScopedReminderById = vi.fn();
const trackServerAnalyticsEvent = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/email/send-reminder", () => ({
  sendReminderEmail
}));

vi.mock("@/lib/organization/scoped-admin", () => ({
  getScopedNotificationLogById: vi.fn(),
  getScopedReminderById: vi.fn(),
  updateScopedReminderById
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

function buildDuplicateSuppressionClient() {
  const state = {
    reminderUpdates: [] as Array<Record<string, unknown>>,
    reminderRunInserts: [] as Array<Record<string, unknown>>,
    reminderRunUpdates: [] as Array<Record<string, unknown>>,
    notificationInserts: [] as Array<Record<string, unknown>>
  };

  const joinedReminder = {
    id: "reminder-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    remind_at: "2030-01-01T00:00:00.000Z",
    reminder_type: "renewal",
    recipient_email: "owner@example.com",
    recipient_emails: ["owner@example.com"],
    status: "pending",
    attempt_count: 0,
    max_attempts: 3,
    escalation_level: 0,
    rule_name: null,
    contracts: {
      id: "contract-1",
      contract_metadata: {
        contract_title: "MSA",
        counterparty_name: "Acme"
      }
    },
    organizations: {}
  };

  const client = {
    from(table: string) {
      if (table === "reminders") {
        return {
          select() {
            return {
              in() {
                return {
                  or() {
                    return {
                      async order() {
                        return { data: [joinedReminder], error: null };
                      }
                    };
                  }
                };
              },
              eq() {
                return this;
              },
              async single() {
                throw new Error("single should not be used in duplicate suppression flow");
              }
            };
          },
          update(payload: Record<string, unknown>) {
            state.reminderUpdates.push(payload);
            return {
              eq() {
                return this;
              },
              in() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return { data: joinedReminder, error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }

      if (table === "notification_logs") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: { id: "existing-notification" }, error: null };
                  }
                };
              }
            };
          },
          async insert(payload: Record<string, unknown>) {
            state.notificationInserts.push(payload);
            return { error: null };
          }
        };
      }

      if (table === "reminder_runs") {
        return {
          async insert(payload: Record<string, unknown>) {
            state.reminderRunInserts.push(payload);
            return { error: null };
          },
          update(payload: Record<string, unknown>) {
            state.reminderRunUpdates.push(payload);
            return {
              eq() {
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, state };
}

function buildFailureProgressionClient(input: { attemptCount: number; maxAttempts: number }) {
  const state = {
    reminderUpdates: [] as Array<Record<string, unknown>>,
    reminderRunUpserts: [] as Array<Record<string, unknown>>,
    notificationInserts: [] as Array<Record<string, unknown>>
  };

  const client = {
    from(table: string) {
      if (table === "reminders") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              async single() {
                return {
                  data: {
                    attempt_count: input.attemptCount,
                    max_attempts: input.maxAttempts,
                    recipient_email: "owner@example.com"
                  },
                  error: null
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            state.reminderUpdates.push(payload);
            return {
              eq() {
                return this;
              },
              then(onFulfilled: (value: { error: null }) => unknown) {
                return Promise.resolve({ error: null }).then(onFulfilled);
              }
            };
          }
        };
      }

      if (table === "reminder_runs") {
        return {
          async upsert(payload: Record<string, unknown>) {
            state.reminderRunUpserts.push(payload);
            return { error: null };
          }
        };
      }

      if (table === "notification_logs") {
        return {
          async insert(payload: Record<string, unknown>) {
            state.notificationInserts.push(payload);
            return { error: null };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, state };
}

describe("reminder control plane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendReminderEmail.mockResolvedValue({ data: { id: "email-1" } });
    updateScopedReminderById.mockResolvedValue({ error: null });
  });

  it(
    "suppresses duplicate reminder deliveries when a delivery key already exists",
    async () => {
      const { client, state } = buildDuplicateSuppressionClient();
      createAdminSupabaseClient.mockReturnValue(client);

      const { processDueReminders } = await import("@/lib/notifications/reminders");
      const result = await processDueReminders("2030-01-01T00:00:00.000Z");

      expect(sendReminderEmail).not.toHaveBeenCalled();
      expect(result).toEqual([
        {
          id: "reminder-1",
          status: "sent",
          duplicateSuppressedCount: 1,
          deliveryCount: 0
        }
      ]);
      expect(state.notificationInserts).toEqual([
        expect.objectContaining({
          reminder_id: "reminder-1",
          organization_id: "org-1",
          channel: "email",
          status: "duplicate_suppressed"
        })
      ]);
      expect(state.reminderRunInserts).toHaveLength(1);
      expect(state.reminderRunUpdates).toContainEqual({
        status: "sent_with_duplicate_suppression"
      });
      expect(state.reminderUpdates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "processing" }),
          expect.objectContaining({ status: "sent" })
        ])
      );
    },
    15000
  );

  it("moves a failed reminder into retry_pending before the terminal threshold", async () => {
    const { client, state } = buildFailureProgressionClient({ attemptCount: 0, maxAttempts: 3 });
    createAdminSupabaseClient.mockReturnValue(client);

    const { markReminderFailure } = await import("@/lib/notifications/reminders");
    await markReminderFailure("reminder-1", "org-1", "smtp timeout");

    expect(state.reminderUpdates[0]!).toEqual(
      expect.objectContaining({
        status: "retry_pending",
        attempt_count: 1,
        last_error: "smtp timeout"
      })
    );
    expect(state.reminderUpdates[0]!.next_retry_at).toEqual(expect.any(String));
    expect(state.reminderRunUpserts[0]!).toEqual(
      expect.objectContaining({
        status: "retry_pending",
        error_message: "smtp timeout"
      })
    );
  });

  it("moves a failed reminder into failed_terminal at the max attempt threshold", async () => {
    const { client, state } = buildFailureProgressionClient({ attemptCount: 2, maxAttempts: 3 });
    createAdminSupabaseClient.mockReturnValue(client);

    const { markReminderFailure } = await import("@/lib/notifications/reminders");
    await markReminderFailure("reminder-1", "org-1", "permanent provider error");

    expect(state.reminderUpdates[0]!).toEqual(
      expect.objectContaining({
        status: "failed_terminal",
        attempt_count: 3,
        last_error: "permanent provider error",
        next_retry_at: null
      })
    );
    expect(state.reminderRunUpserts[0]!).toEqual(
      expect.objectContaining({
        status: "failed_terminal",
        error_message: "permanent provider error"
      })
    );
  });

  it("rerunReminderJob resets retry state without changing org scope", async () => {
    const { rerunReminderJob } = await import("@/lib/notifications/reminders");
    await rerunReminderJob("reminder-1", "org-1");

    expect(updateScopedReminderById).toHaveBeenCalledWith(
      "reminder-1",
      "org-1",
      expect.objectContaining({
        status: "retry_pending",
        processing_started_at: null,
        processing_token: null
      })
    );
    expect(updateScopedReminderById.mock.calls[0]![2].next_retry_at).toEqual(expect.any(String));
  });
});
