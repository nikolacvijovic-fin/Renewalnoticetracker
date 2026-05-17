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
const importJobUpdates: Array<Record<string, unknown>> = [];
const contractMetadataInserts: Array<Record<string, unknown>> = [];

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
    importJobUpdates.length = 0;
    contractMetadataInserts.length = 0;
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
        notice_deadline_date: "2026-12-01",
        renewal_date: "2026-12-31",
        expiration_date: "2026-12-31",
        termination_window: "30 days",
        owner_email: "owner@example.com",
        department: "Legal",
        auto_renewal_flag: "true",
        contract_value: "125000",
        source_file_name: "contracts.xlsx"
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
            update: (payload: Record<string, unknown>) => {
              importJobUpdates.push(payload);
              return {
              eq: () => ({
                eq: () => Promise.resolve({ error: null })
              })
              };
            }
          };
        }
        if (table === "contracts" && !reminderInserts.length) {
          return {
            select: () => ({
              eq: () => Promise.resolve({
                data: [],
                error: null
              })
            }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: "c-1" }, error: null })
              })
            })
          };
        }
        if (table === "counterparties") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null })
            }),
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: "cp-1" }, error: null })
              })
            })
          };
        }
        if (table === "counterparty_aliases") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [], error: null })
            })
          };
        }
        if (table === "contract_metadata") {
          return {
            insert: (payload: Record<string, unknown>) => {
              contractMetadataInserts.push(payload);
              return Promise.resolve({ error: null });
            }
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
    expect(importJobUpdates.at(-1)).toEqual(
      expect.objectContaining({
        status: "completed",
        imported_count: 1,
        error_report_json: expect.arrayContaining([
          expect.objectContaining({ status: "imported", contract_title: "MSA" })
        ])
      })
    );
    expect(contractMetadataInserts.at(-1)).toEqual(
      expect.objectContaining({
        contract_value_amount: 125000,
        contract_value_currency: null,
        financial_data_trust_status: "low"
      })
    );
    expect(reminderInserts).toHaveLength(0);
  }, 15000);

  it("marks partial-success imports as needs_cleanup and still creates review queue rows", async () => {
    parseImportFile.mockReturnValue([
      {
        contract_title: "Owner Missing",
        counterparty_name: "Acme",
        renewal_date: "2026-12-31",
        source_file_name: "contracts.xlsx"
      },
      {
        contract_title: "Bad Dates",
        counterparty_name: "Beta",
        notice_deadline_date: "01/02/2026",
        source_file_name: "contracts.xlsx"
      }
    ]);

    const { importContractsAction } = await import("@/lib/actions/contracts");
    const formData = new FormData();
    const file = new File(["contract_title"], "contracts.csv", { type: "text/csv" });
    formData.append("file", file);

    await importContractsAction(formData);

    expect(importJobUpdates.at(-1)).toEqual(
      expect.objectContaining({
        status: "needs_cleanup",
        imported_count: 1,
        error_report_json: expect.arrayContaining([
          expect.objectContaining({ row: 2, status: "needs_cleanup" }),
          expect.objectContaining({ row: 3, status: "failed" })
        ])
      })
    );
    expect(reminderInserts).toHaveLength(0);
  });
});
