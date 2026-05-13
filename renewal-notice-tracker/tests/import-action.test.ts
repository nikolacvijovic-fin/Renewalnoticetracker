import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const createAdminSupabaseClient = vi.fn();
const getOrganizationMembers = vi.fn();
const getOrganizationContractCount = vi.fn();
const enforceFeatureAccess = vi.fn();
const getAllowedReminderRecipients = vi.fn();
const getContractTrackingLimitResult = vi.fn();
const createAuditLog = vi.fn();
const parseImportFile = vi.fn();
const reminderInserts: Array<unknown> = [];

const filePrototype = File.prototype as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> };
if (!filePrototype.arrayBuffer) {
  filePrototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
}

vi.mock("@/lib/auth", () => ({
  requireOrganization,
  requireShippedRuntimeAction
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getOrganizationMembers,
  getOrganizationContractCount
}));

vi.mock("@/lib/billing/entitlements", () => ({
  CommercialAccessError: class CommercialAccessError extends Error {},
  enforceFeatureAccess,
  getAllowedReminderRecipients,
  getContractTrackingLimitResult
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/contracts/import", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contracts/import")>(
    "@/lib/contracts/import"
  );
  return {
    ...actual,
    parseImportFile
  };
});

vi.mock("@/lib/ai/extract-contract", () => ({
  extractContractMetadata: vi.fn()
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

describe("importContractsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reminderInserts.length = 0;
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "owner"
    });
    requireShippedRuntimeAction.mockResolvedValue({
      user: { id: "user-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    enforceFeatureAccess.mockResolvedValue({
      billingSnapshot: { planTier: "growth", subscriptionStatus: "active", billingProvider: "paddle" }
    });
    getAllowedReminderRecipients.mockImplementation((_: unknown, recipients: string[]) => recipients);
    getOrganizationMembers.mockResolvedValue([
      {
        user_id: "user-1",
        user: { notification_email: "owner@example.com" }
      }
    ]);
    getOrganizationContractCount.mockResolvedValue(1);
    getContractTrackingLimitResult.mockReturnValue({
      allowed: true,
      currentCount: 1,
      limit: 300,
      remaining: 299,
      message: "ok"
    });

    parseImportFile.mockReturnValue([
      {
        contract_title: "MSA",
        counterparty_name: "Acme",
        renewal_date: "2026-12-31",
        expiration_date: "2026-12-31",
        notice_deadline_date: "2026-12-01",
        termination_window: "30 days",
        auto_renewal_flag: "true",
        recipient_emails: "owner@example.com"
      }
    ]);

    createAdminSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "import_jobs") {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: "job-1" }, error: null })
              })
            }),
            update: () => ({
              eq: () => ({
                eq: () => Promise.resolve({ error: null })
              })
            })
          };
        }
        if (table === "counterparties") {
          return {
            select: () => ({
              eq: () => ({
                ilike: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null })
                })
              })
            }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: "cp-1" }, error: null })
              })
            })
          };
        }
        if (table === "contracts") {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: "c-1" }, error: null })
              })
            })
          };
        }
        if (table === "contract_metadata") {
          return {
            insert: () => Promise.resolve({ error: null })
          };
        }
        if (table === "reminders") {
          return {
            insert: (payload: unknown) => {
              reminderInserts.push(payload);
              return Promise.resolve({ error: null });
            }
          };
        }
        return {
          insert: () => Promise.resolve({ error: null }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) })
        };
      }
    });
  });

  it("imports contracts into the review queue and logs partial-success-safe audit data", async () => {
    const { importContractsAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    const file = new File(["contract_title"], "contracts.csv", { type: "text/csv" });
    formData.append("file", file);

    await importContractsAction(formData);

    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contracts.imported",
        details: expect.objectContaining({ imported_count: 1, review_queue_created_count: 1 })
      })
    );
    expect(reminderInserts).toHaveLength(0);
  }, 15000);
});
