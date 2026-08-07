import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const requireScopedContract = vi.fn();
const getScopedContractMetadataId = vi.fn();
const getTemplates = vi.fn();
const getOrganizationMembers = vi.fn();
const getBillingSnapshot = vi.fn();
const getAllowedReminderRecipients = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAdminSupabaseClient = vi.fn();
const generateReminderRecommendations = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const revalidatePath = vi.fn();

const insertedReminderBatches: Array<unknown> = [];
const transitionedStatuses: string[] = [];
const reminderUpdates: Array<Record<string, unknown>> = [];
let existingReminderRows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireOrganization,
    requireShippedRuntimeAction
  };
});

vi.mock("@/lib/contracts/kernel-queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/kernel-queries")>(
    "@/lib/contracts/kernel-queries"
  );
  return {
    ...actual,
    requireScopedContract,
    getScopedContractMetadataId,
    getTemplates,
    getOrganizationMembers
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

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/contracts/reminders", () => ({
  generateReminderRecommendations
}));

vi.mock("@/lib/contracts/lifecycle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/lifecycle")>(
    "@/lib/contracts/lifecycle"
  );
  return {
    ...actual,
    transitionContractStatus: vi.fn(
      async (_client: unknown, _contractId: string, _organizationId: string, status: string) => {
        transitionedStatuses.push(status);
      }
    )
  };
});

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

describe("review reminder regeneration", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    insertedReminderBatches.length = 0;
    transitionedStatuses.length = 0;
    reminderUpdates.length = 0;
    existingReminderRows = [
      {
        id: "existing-system-reminder",
        source: "system",
        status: "pending",
        recipient_email: "owner@example.com",
        recipient_emails: ["owner@example.com"],
        delivery_key: null
      }
    ];

    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    requireShippedRuntimeAction.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    requireScopedContract.mockResolvedValue({ id: "contract-1" });
    getScopedContractMetadataId.mockResolvedValue("metadata-1");
    getTemplates.mockResolvedValue([]);
    getOrganizationMembers.mockResolvedValue([
      {
        user_id: "user-1",
        user: { notification_email: "owner@example.com", full_name: "Owner" }
      }
    ]);
    getBillingSnapshot.mockResolvedValue({
      organizationId: "org-1",
      planTier: "growth",
      subscriptionStatus: "active",
      billingProvider: "paddle",
      trialEndsAt: null,
      currentPeriodEnd: null
    });
    getAllowedReminderRecipients.mockImplementation((_snapshot: unknown, recipients: string[]) => recipients);
    generateReminderRecommendations.mockReturnValue([
      {
        reminder_type: "notice_deadline",
        remind_at: "2031-01-01T00:00:00.000Z",
        recipient_email: "owner@example.com",
        recipient_emails: ["owner@example.com"],
        source: "system"
      }
    ]);

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        if (table === "contract_metadata") {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: {
                    needs_review: true,
                    notice_deadline_date: "2031-01-01",
                    renewal_date: "2031-02-01",
                    expiration_date: "2031-02-01",
                    termination_window: "30 days",
                    auto_renewal: true,
                    is_ocr_assisted: false
                  },
                  error: null
                })
              })
            }),
            update: () => ({
              eq: vi.fn().mockResolvedValue({ error: null })
            })
          };
        }

        if (table === "contracts") {
          return {
            update: () => ({
              eq: () => ({
                eq: vi.fn().mockResolvedValue({ error: null })
              })
            })
          };
        }

        if (table === "users") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { notification_email: "owner@example.com" }
                })
              })
            })
          };
        }

        if (table === "organizations") {
          return {
            select: () => ({
              eq: () => ({
                single: vi.fn().mockResolvedValue({
                  data: { billing_email: "billing@example.com" }
                })
              })
            })
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }
    });

    createAdminSupabaseClient.mockReturnValue({
      from(table: string) {
        if (table === "extracted_field_evidence") {
          return {
            delete: () => ({
              eq: vi.fn().mockResolvedValue({ error: null })
            }),
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }

        if (table === "reminders") {
          return {
            select: () => ({
              eq: () => ({
                order: vi.fn().mockResolvedValue({
                  data: existingReminderRows,
                  error: null
                })
              })
            }),
            update: (payload: Record<string, unknown>) => {
              reminderUpdates.push(payload);
              return {
                in: () => ({
                  eq: vi.fn().mockResolvedValue({ error: null })
                })
              };
            },
            insert: (payload: unknown) => {
              insertedReminderBatches.push(payload);
              return Promise.resolve({ error: null });
            }
          };
        }

        if (table === "counterparties") {
          return {
            select: () => ({
              eq: () => ({
                ilike: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: "cp-1" }, error: null })
                })
              })
            }),
            insert: () => ({
              select: () => ({
                single: vi.fn().mockResolvedValue({ data: { id: "cp-1" }, error: null })
              })
            })
          };
        }

        if (table === "counterparty_aliases") {
          return {
            select: () => ({
              eq: () => ({
                ilike: () => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
                })
              })
            }),
            insert: vi.fn().mockResolvedValue({ error: null })
          };
        }

        throw new Error(`Unexpected admin table: ${table}`);
      }
    });
  });

  it(
    "regenerates system reminders only after review is completed",
    async () => {
    const { updateContractReviewAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("contract_title", "Reviewed MSA");
    formData.append("counterparty_name", "Acme");
    formData.append("contract_type", "MSA");
    formData.append("effective_date", "2030-01-01");
    formData.append("renewal_date", "2031-02-01");
    formData.append("expiration_date", "2031-02-01");
    formData.append("auto_renewal", "true");
    formData.append("renewal_term", "Annual");
    formData.append("notice_period_value", "30");
    formData.append("notice_period_unit", "days");
    formData.append("notice_deadline_date", "2031-01-01");
    formData.append("termination_window", "30 days");
    formData.append("governing_law", "Serbia");
    formData.append("payment_terms", "Net 30");
    formData.append("extracted_clauses", "[]");
    formData.append(
      "field_confidence",
      "{\"expiration_date\":1,\"notice_deadline_date\":1,\"renewal_date\":1,\"termination_window\":1,\"auto_renewal\":1}"
    );
    formData.append(
      "field_source_snippets",
      "{\"expiration_date\":\"expires on February 1, 2031\",\"notice_deadline_date\":\"30 days before expiration\",\"renewal_date\":\"renews on February 1, 2031\",\"termination_window\":\"30 days\",\"auto_renewal\":\"auto-renews\"}"
    );
    formData.append("reminder_recommendations", "[]");
    formData.append("reviewer_notes", "Reviewed and confirmed.");
    formData.append("needs_review", "false");
    formData.append("review_mode", "fast_review");
    formData.append("owner_user_id", "11111111-1111-4111-8111-111111111111");
    formData.append("department", "Finance");
    formData.append("status_tag", "active");
    formData.append("renewal_decision_status", "undecided");

    await updateContractReviewAction("contract-1", formData);

    expect(transitionedStatuses).toEqual(
      expect.arrayContaining([
        "reviewed",
        "reminder_generation_pending",
        "reminders_scheduled"
      ])
    );
    expect(insertedReminderBatches).toHaveLength(1);
    expect(reminderUpdates).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: "superseded" })])
    );
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "reminder_scheduled",
        properties: expect.objectContaining({
          contract_id: "contract-1",
          reminder_regenerated_count: 1
        })
      })
    );
    expect(trackServerAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "contract_review_completed"
      })
    );
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.review_updated",
        details: expect.objectContaining({
          reminder_regenerated_count: 1,
          superseded_reminder_count: 1,
          processing_status: "scheduled"
        })
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/contracts/contract-1");
    },
    15000
  );

  it("keeps missing-owner workflows blocked while generating internal fallback reminders", async () => {
    getOrganizationMembers.mockResolvedValue([
      {
        user_id: "admin-user",
        role: "admin",
        user: { notification_email: "admin@example.com", full_name: "Admin" }
      },
      {
        user_id: "operator-user",
        role: "operator",
        user: { notification_email: "operator@example.com", full_name: "Operator" }
      },
      {
        user_id: "member-user",
        role: "member",
        user: { notification_email: "member@example.com", full_name: "Member" }
      }
    ]);

    const { updateContractReviewAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("contract_title", "Reviewed MSA");
    formData.append("counterparty_name", "Acme");
    formData.append("contract_type", "MSA");
    formData.append("effective_date", "2030-01-01");
    formData.append("renewal_date", "2031-02-01");
    formData.append("expiration_date", "2031-02-01");
    formData.append("auto_renewal", "true");
    formData.append("renewal_term", "Annual");
    formData.append("notice_period_value", "30");
    formData.append("notice_period_unit", "days");
    formData.append("notice_deadline_date", "2031-01-01");
    formData.append("termination_window", "30 days");
    formData.append("governing_law", "Serbia");
    formData.append("payment_terms", "Net 30");
    formData.append("extracted_clauses", "[]");
    formData.append(
      "field_confidence",
      "{\"expiration_date\":1,\"notice_deadline_date\":1,\"renewal_date\":1,\"termination_window\":1,\"auto_renewal\":1}"
    );
    formData.append(
      "field_source_snippets",
      "{\"expiration_date\":\"expires on February 1, 2031\",\"notice_deadline_date\":\"30 days before expiration\",\"renewal_date\":\"renews on February 1, 2031\",\"termination_window\":\"30 days\",\"auto_renewal\":\"auto-renews\"}"
    );
    formData.append("reminder_recommendations", "[]");
    formData.append("reviewer_notes", "Reviewed and confirmed.");
    formData.append("needs_review", "false");
    formData.append("review_mode", "fast_review");
    formData.append("owner_user_id", "");
    formData.append("department", "Finance");
    formData.append("status_tag", "active");
    formData.append("renewal_decision_status", "undecided");

    await updateContractReviewAction("contract-1", formData);

    expect(transitionedStatuses).toEqual(expect.arrayContaining(["reviewed"]));
    expect(transitionedStatuses).not.toContain("reminder_generation_pending");
    expect(transitionedStatuses).not.toContain("reminders_scheduled");
    expect(generateReminderRecommendations).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner_user_id: null }),
      ["admin@example.com", "operator@example.com", "owner@example.com", "billing@example.com", "member@example.com"],
      expect.objectContaining({
        organizationId: "org-1",
        contractId: "contract-1"
      })
    );
    expect(insertedReminderBatches).toHaveLength(1);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.review_updated",
        details: expect.objectContaining({
          reminder_regenerated_count: 1,
          processing_status: "blocked_by_missing_owner"
        })
      })
    );
  });

  it("skips regenerated system reminders when the same delivery window already exists", async () => {
    generateReminderRecommendations.mockReturnValueOnce([
      {
        reminder_type: "notice_deadline",
        remind_at: "2031-01-01T00:00:00.000Z",
        recipient_email: "owner@example.com",
        recipient_emails: ["owner@example.com"],
        delivery_key: "renewal-deadline:org-1:contract-1:30d:2031-01-01",
        escalation_level: 1,
        source: "system"
      }
    ]);
    existingReminderRows = [
      {
        id: "already-sent",
        source: "system",
        status: "sent",
        recipient_email: "owner@example.com",
        recipient_emails: ["owner@example.com"],
        delivery_key: "renewal-deadline:org-1:contract-1:30d:2031-01-01"
      }
    ];

    const { updateContractReviewAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    formData.append("contract_title", "Reviewed MSA");
    formData.append("counterparty_name", "Acme");
    formData.append("contract_type", "MSA");
    formData.append("effective_date", "2030-01-01");
    formData.append("renewal_date", "2031-02-01");
    formData.append("expiration_date", "2031-02-01");
    formData.append("auto_renewal", "true");
    formData.append("renewal_term", "Annual");
    formData.append("notice_period_value", "30");
    formData.append("notice_period_unit", "days");
    formData.append("notice_deadline_date", "2031-01-01");
    formData.append("termination_window", "30 days");
    formData.append("governing_law", "Serbia");
    formData.append("payment_terms", "Net 30");
    formData.append("extracted_clauses", "[]");
    formData.append(
      "field_confidence",
      "{\"expiration_date\":1,\"notice_deadline_date\":1,\"renewal_date\":1,\"termination_window\":1,\"auto_renewal\":1}"
    );
    formData.append(
      "field_source_snippets",
      "{\"expiration_date\":\"expires on February 1, 2031\",\"notice_deadline_date\":\"30 days before expiration\",\"renewal_date\":\"renews on February 1, 2031\",\"termination_window\":\"30 days\",\"auto_renewal\":\"auto-renews\"}"
    );
    formData.append("reminder_recommendations", "[]");
    formData.append("reviewer_notes", "Reviewed and confirmed.");
    formData.append("needs_review", "false");
    formData.append("review_mode", "fast_review");
    formData.append("owner_user_id", "11111111-1111-4111-8111-111111111111");
    formData.append("department", "Finance");
    formData.append("status_tag", "active");
    formData.append("renewal_decision_status", "undecided");

    await updateContractReviewAction("contract-1", formData);

    expect(insertedReminderBatches).toHaveLength(0);
    expect(reminderUpdates).toEqual([]);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.review_updated",
        details: expect.objectContaining({
          reminder_regenerated_count: 0
        })
      })
    );
  });
});
