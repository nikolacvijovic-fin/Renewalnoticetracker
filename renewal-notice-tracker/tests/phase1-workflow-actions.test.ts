import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const assertCanUseShippedAction = vi.fn();
const requireScopedContract = vi.fn();
const getBillingSnapshot = vi.fn();
const getAllowedReminderRecipients = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const revalidatePath = vi.fn();

const contractUpdates: Array<Record<string, unknown>> = [];
const renewalDecisionInserts: Array<Record<string, unknown>> = [];
const reminderInserts: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth", () => ({
  requireOrganization,
  requireShippedRuntimeAction,
  assertCanUseShippedAction
}));

vi.mock("@/lib/contracts/kernel-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/kernel-queries")>(
    "@/lib/contracts/kernel-queries"
  );
  return {
    ...actual,
    requireScopedContract
  };
});

vi.mock("@/lib/billing/entitlements", async () => {
  const actual = await vi.importActual<typeof import("@/lib/billing/entitlements")>(
    "@/lib/billing/entitlements"
  );
  return {
    ...actual,
    getBillingSnapshot,
    getAllowedReminderRecipients
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
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

describe("phase1 workflow actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractUpdates.length = 0;
    renewalDecisionInserts.length = 0;
    reminderInserts.length = 0;
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "owner"
    });
    requireShippedRuntimeAction.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "owner"
    });
    assertCanUseShippedAction.mockImplementation(
      async (
        context: { organizationId: string } | null,
        _action: string,
        object?: { assertScoped?: (organizationId: string) => Promise<void> }
      ) => {
        if (!context) {
          throw new Error("Active organization required.");
        }
        await object?.assertScoped?.(context.organizationId);
        return context;
      }
    );
    requireScopedContract.mockResolvedValue({ id: "contract-1" });
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "starter",
      subscriptionStatus: "active",
      billingProvider: "paddle"
    });
    getAllowedReminderRecipients.mockImplementation((_snapshot: unknown, recipients: string[]) => recipients);
    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        if (table === "renewal_decisions") {
          return {
            insert: (payload: Record<string, unknown>) => {
              renewalDecisionInserts.push(payload);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "decision-1" }, error: null })
                })
              };
            }
          };
        }

        if (table === "contracts") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        owner_user_id: "user-1",
                        contract_metadata: {
                          needs_review: false,
                          notice_deadline_date: "2030-01-01",
                          renewal_date: "2030-02-01",
                          expiration_date: "2030-02-01"
                        }
                      },
                      error: null
                    })
                })
              })
            }),
            update: (payload: Record<string, unknown>) => {
              contractUpdates.push(payload);
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ error: null })
                })
              };
            }
          };
        }

        if (table === "reminders") {
          return {
            insert: (payload: Record<string, unknown>) => {
              reminderInserts.push(payload);
              return {
                select: () => ({
                  single: () => Promise.resolve({ data: { id: "reminder-1" }, error: null })
                })
              };
            }
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }
    });
  });

  it(
    "closes the cycle when a real decision is recorded",
    async () => {
    const { createRenewalDecisionAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("status", "renew");
    formData.append("summary", "Proceed with renewal");

    await createRenewalDecisionAction("contract-1", formData);

    expect(renewalDecisionInserts[0]).toMatchObject({
      contract_id: "contract-1",
      organization_id: "org-1",
      status: "renew"
    });
    expect(contractUpdates).toContainEqual(
      expect.objectContaining({
        renewal_decision_status: "renew",
        cycle_status: "closed"
      })
    );
    },
    15000
  );

  it("records acknowledgment as workflow state without changing business truth", async () => {
    const { acknowledgeContractAction } = await import("@/lib/actions/contracts");

    await acknowledgeContractAction("contract-1");

    expect(contractUpdates).toContainEqual(
      expect.objectContaining({
        cycle_status: "awaiting_decision",
        last_acknowledged_by: "user-1"
      })
    );
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "acknowledgment_recorded"
      })
    );
  });

  it("allows explicit reopen and park actions through the cycle state endpoint", async () => {
    const { updateRenewalCycleAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("cycle_status", "reopened");

    await updateRenewalCycleAction("contract-1", formData);

    expect(contractUpdates).toContainEqual(
      expect.objectContaining({
        cycle_status: "reopened"
      })
    );
  });

  it("blocks manual trusted reminders until review is complete", async () => {
    createServerSupabaseClient.mockReturnValueOnce({
      from(table: string) {
        if (table !== "contracts") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      owner_user_id: "user-1",
                      contract_metadata: {
                        needs_review: true,
                        notice_deadline_date: "2030-01-01",
                        renewal_date: "2030-02-01",
                        expiration_date: "2030-02-01"
                      }
                    },
                    error: null
                  })
              })
            })
          })
        };
      }
    });

    const { createReminderAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("recipient_emails", "owner@example.com");
    formData.append("reminder_type", "notice_deadline");
    formData.append("remind_at", "2030-01-01T00:00:00.000Z");

    await expect(createReminderAction("contract-1", formData)).rejects.toThrow(
      "Trusted reminders stay blocked until review is complete."
    );

    expect(reminderInserts).toHaveLength(0);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reminder.blocked",
        details: expect.objectContaining({ processing_status: "blocked_by_review" })
      })
    );
  });

  it("blocks manual trusted reminders until an owner is assigned", async () => {
    createServerSupabaseClient.mockReturnValueOnce({
      from(table: string) {
        if (table !== "contracts") {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      owner_user_id: null,
                      contract_metadata: {
                        needs_review: false,
                        notice_deadline_date: "2030-01-01",
                        renewal_date: "2030-02-01",
                        expiration_date: "2030-02-01"
                      }
                    },
                    error: null
                  })
              })
            })
          })
        };
      }
    });

    const { createReminderAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("recipient_emails", "owner@example.com");
    formData.append("reminder_type", "notice_deadline");
    formData.append("remind_at", "2030-01-01T00:00:00.000Z");

    await expect(createReminderAction("contract-1", formData)).rejects.toThrow(
      "Trusted reminders stay blocked until an owner is assigned."
    );

    expect(reminderInserts).toHaveLength(0);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "reminder.blocked",
        details: expect.objectContaining({ processing_status: "blocked_by_missing_owner" })
      })
    );
  });
});
