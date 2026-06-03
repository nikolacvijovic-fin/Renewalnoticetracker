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
  const reminder = buildJoinedReminder();
  return buildReminderProcessingClient({
    selectedReminders: [reminder],
    claimedReminder: reminder,
    duplicateExists: true
  });
}

function buildJoinedReminder(overrides?: Partial<Record<string, unknown>>) {
  return {
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
    processing_started_at: null,
    processing_token: null,
    contracts: {
      id: "contract-1",
      contract_metadata: {
        contract_title: "MSA",
        counterparty_name: "Acme"
      }
    },
    organizations: {},
    ...overrides
  };
}

function buildReminderProcessingClient(input?: {
  selectedReminders?: Array<Record<string, unknown>>;
  claimedReminder?: Record<string, unknown> | null;
  duplicateExists?: boolean;
  staleProcessingRows?: Array<Record<string, unknown>>;
  writeErrors?: Partial<Record<string, Error>>;
}) {
  const state = {
    reminderUpdates: [] as Array<Record<string, unknown>>,
    reminderRunInserts: [] as Array<Record<string, unknown>>,
    reminderRunUpdates: [] as Array<Record<string, unknown>>,
    notificationInserts: [] as Array<Record<string, unknown>>,
    rescuedReminderIds: [] as string[]
  };

  const selectedReminders = input?.selectedReminders ?? [buildJoinedReminder()];
  const claimedReminder = input?.claimedReminder ?? selectedReminders[0] ?? null;
  const staleProcessingRows = input?.staleProcessingRows ?? [];
  const getWriteError = (key: string) => input?.writeErrors?.[key] ?? null;

  const getReminderUpdateWriteError = (payload: Record<string, unknown>) => {
    if (payload.status === "processing") {
      return getWriteError("reminders:update:claim");
    }

    if (payload.status === "sent") {
      return getWriteError("reminders:update:mark_sent");
    }

    if (
      payload.status === "retry_pending" &&
      payload.last_error ===
        "Reminder processing lease expired. Returned to retry_pending for rescue."
    ) {
      return getWriteError("reminders:update:rescue");
    }

    if (payload.status === "retry_pending" || payload.status === "failed_terminal") {
      return getWriteError("reminders:update:failure");
    }

    return null;
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
                      order() {
                        return {
                          async limit() {
                            return { data: selectedReminders, error: null };
                          }
                        };
                      }
                    };
                  }
                };
              },
              eq() {
                return this;
              },
              async single() {
                const sourceReminder = (claimedReminder ?? selectedReminders[0] ?? {}) as Record<
                  string,
                  unknown
                >;
                return {
                  data: {
                    attempt_count: Number(sourceReminder.attempt_count ?? 0),
                    max_attempts: Number(sourceReminder.max_attempts ?? 3),
                    recipient_email: String(sourceReminder.recipient_email ?? "owner@example.com")
                  },
                  error: null
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            const filters: {
              eq: Array<[string, unknown]>;
              lt?: [string, unknown];
            } = { eq: [] };

            const chain = {
              eq(column: string, value: unknown) {
                filters.eq.push([column, value]);
                return chain;
              },
              in() {
                return chain;
              },
              lt() {
                const isRescue = filters.eq.some(
                  ([column, value]) => column === "status" && value === "processing"
                );
                if (isRescue && staleProcessingRows.length > 0) {
                  state.reminderUpdates.push(payload);
                  state.rescuedReminderIds.push(
                    ...staleProcessingRows.map((row) => String(row.id))
                  );
                }

                return Promise.resolve({ error: getReminderUpdateWriteError(payload) });
              },
              select() {
                return {
                  async maybeSingle() {
                    state.reminderUpdates.push(payload);
                    return {
                      data: claimedReminder,
                      error: getReminderUpdateWriteError(payload)
                    };
                  }
                };
              },
              then(onFulfilled: (value: { error: Error | null }) => unknown) {
                state.reminderUpdates.push(payload);
                return Promise.resolve({
                  error: getReminderUpdateWriteError(payload)
                }).then(onFulfilled);
              }
            };

            return chain;
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
                    return {
                      data: input?.duplicateExists ? { id: "existing-notification" } : null,
                      error: null
                    };
                  }
                };
              }
            };
          },
          async insert(payload: Record<string, unknown>) {
            state.notificationInserts.push(payload);
            return { error: getWriteError("notification_logs:insert") };
          }
        };
      }

      if (table === "reminder_runs") {
        return {
          async insert(payload: Record<string, unknown>) {
            state.reminderRunInserts.push(payload);
            return { error: getWriteError("reminder_runs:insert") };
          },
          update(payload: Record<string, unknown>) {
            state.reminderRunUpdates.push(payload);
            return {
              eq() {
                return Promise.resolve({ error: getWriteError("reminder_runs:update") });
              }
            };
          },
          async upsert(payload: Record<string, unknown>) {
            state.reminderRunUpdates.push(payload);
            return { error: getWriteError("reminder_runs:upsert") };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, state };
}

function buildFailureProgressionClient(input: {
  attemptCount: number;
  maxAttempts: number;
  writeErrors?: Partial<Record<string, Error>>;
}) {
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
              then(onFulfilled: (value: { error: Error | null }) => unknown) {
                return Promise.resolve({
                  error: input.writeErrors?.["reminders:update"] ?? null
                }).then(onFulfilled);
              }
            };
          }
        };
      }

      if (table === "reminder_runs") {
        return {
          async upsert(payload: Record<string, unknown>) {
            state.reminderRunUpserts.push(payload);
            return { error: input.writeErrors?.["reminder_runs:upsert"] ?? null };
          }
        };
      }

      if (table === "notification_logs") {
        return {
          async insert(payload: Record<string, unknown>) {
            state.notificationInserts.push(payload);
            return { error: input.writeErrors?.["notification_logs:insert"] ?? null };
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

  it("rescues a stale processing reminder back to retry_pending and completes delivery", async () => {
    const staleReminder = buildJoinedReminder({
      id: "reminder-stale",
      status: "processing",
      processing_started_at: "2030-01-01T00:00:00.000Z",
      processing_token: "stale-token"
    });
    const rescuedReminder = buildJoinedReminder({
      id: "reminder-stale",
      status: "retry_pending",
      processing_started_at: null,
      processing_token: null
    });
    const { client, state } = buildReminderProcessingClient({
      selectedReminders: [rescuedReminder],
      claimedReminder: rescuedReminder,
      duplicateExists: false,
      staleProcessingRows: [staleReminder]
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    const result = await processDueReminders("2030-01-01T00:15:00.000Z");

    expect(state.rescuedReminderIds).toEqual(["reminder-stale"]);
    expect(state.reminderUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "retry_pending",
          last_error:
            "Reminder processing lease expired. Returned to retry_pending for rescue.",
          processing_started_at: null,
          processing_token: null
        }),
        expect.objectContaining({ status: "processing" }),
        expect.objectContaining({ status: "sent" })
      ])
    );
    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "reminder-stale",
        status: "sent",
        duplicateSuppressedCount: 0,
        deliveryCount: 1
      }
    ]);
  });

  it("does not rescue or double-process a reminder with a fresh active lease", async () => {
    const { client, state } = buildReminderProcessingClient({
      selectedReminders: [],
      claimedReminder: null,
      duplicateExists: false,
      staleProcessingRows: []
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    const result = await processDueReminders("2030-01-01T00:15:00.000Z");

    expect(result).toEqual([]);
    expect(state.rescuedReminderIds).toEqual([]);
    expect(state.reminderUpdates).toEqual([]);
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  it("marks the reminder failed when email send succeeds but the sent-state write fails", async () => {
    const reminder = buildJoinedReminder();
    const { client, state } = buildReminderProcessingClient({
      selectedReminders: [reminder],
      claimedReminder: reminder,
      duplicateExists: false,
      writeErrors: {
        "reminders:update:mark_sent": new Error("mark sent failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    const result = await processDueReminders("2030-01-01T00:00:00.000Z");

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "reminder-1",
        status: "failed",
        error: expect.stringContaining('Privileged update failed for "reminders"')
      }
    ]);
    expect(state.reminderUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "processing" }),
        expect.objectContaining({ status: "sent" }),
        expect.objectContaining({
          status: "retry_pending",
          last_error: expect.stringContaining('Privileged update failed for "reminders"')
        })
      ])
    );
  });

  it("fails explicitly when notification log persistence fails after delivery", async () => {
    const reminder = buildJoinedReminder();
    const { client, state } = buildReminderProcessingClient({
      selectedReminders: [reminder],
      claimedReminder: reminder,
      duplicateExists: false,
      writeErrors: {
        "notification_logs:insert": new Error("notification insert failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    await expect(processDueReminders("2030-01-01T00:00:00.000Z")).rejects.toThrow(
      'Privileged insert failed for "notification_logs"'
    );
    expect(state.reminderUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "processing" }),
        expect.objectContaining({
          status: "retry_pending",
          last_error: expect.stringContaining('Privileged insert failed for "notification_logs"')
        })
      ])
    );
  });

  it("fails before sending when reminder run creation cannot be persisted", async () => {
    const reminder = buildJoinedReminder();
    const { client } = buildReminderProcessingClient({
      selectedReminders: [reminder],
      claimedReminder: reminder,
      duplicateExists: false,
      writeErrors: {
        "reminder_runs:insert": new Error("run insert failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    const result = await processDueReminders("2030-01-01T00:00:00.000Z");

    expect(sendReminderEmail).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: "reminder-1",
        status: "failed",
        error: expect.stringContaining('Privileged insert failed for "reminder_runs"')
      }
    ]);
  });

  it("marks the reminder failed when reminder run finalization cannot be persisted", async () => {
    const reminder = buildJoinedReminder();
    const { client, state } = buildReminderProcessingClient({
      selectedReminders: [reminder],
      claimedReminder: reminder,
      duplicateExists: false,
      writeErrors: {
        "reminder_runs:update": new Error("run finalize failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { processDueReminders } = await import("@/lib/notifications/reminders");
    const result = await processDueReminders("2030-01-01T00:00:00.000Z");

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        id: "reminder-1",
        status: "failed",
        error: expect.stringContaining('Privileged update failed for "reminder_runs"')
      }
    ]);
    expect(state.reminderUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "sent" }),
        expect.objectContaining({
          status: "retry_pending",
          last_error: expect.stringContaining('Privileged update failed for "reminder_runs"')
        })
      ])
    );
  });

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

  it("throws explicitly when markReminderFailure cannot persist the reminder state update", async () => {
    const { client } = buildFailureProgressionClient({
      attemptCount: 0,
      maxAttempts: 3,
      writeErrors: {
        "reminders:update": new Error("failure update failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { markReminderFailure } = await import("@/lib/notifications/reminders");

    await expect(markReminderFailure("reminder-1", "org-1", "smtp timeout")).rejects.toThrow(
      'Privileged update failed for "reminders"'
    );
  });

  it("throws explicitly when markReminderFailure cannot persist the reminder run upsert", async () => {
    const { client } = buildFailureProgressionClient({
      attemptCount: 0,
      maxAttempts: 3,
      writeErrors: {
        "reminder_runs:upsert": new Error("run upsert failed")
      }
    });
    createAdminSupabaseClient.mockReturnValue(client);

    const { markReminderFailure } = await import("@/lib/notifications/reminders");

    await expect(markReminderFailure("reminder-1", "org-1", "smtp timeout")).rejects.toThrow(
      'Privileged upsert failed for "reminder_runs"'
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
