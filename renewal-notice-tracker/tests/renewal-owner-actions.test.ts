import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const requireScopedContract = vi.fn();
const getOrganizationMembers = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const sendRenewalActionRequestEmail = vi.fn();
const revalidatePath = vi.fn();

const contractUpdates: Array<Record<string, unknown>> = [];
const requestInserts: Array<Record<string, unknown>> = [];
const requestUpdates: Array<Record<string, unknown>> = [];

const contractRow = {
  id: "contract-1",
  owner_user_id: "owner-1",
  contract_metadata: {
    contract_title: "Acme MSA",
    counterparty_name: "Acme",
    notice_deadline_date: "2030-01-01",
    renewal_date: "2030-02-01",
    expiration_date: null,
    contract_value_amount: 100000,
    contract_value_currency: "USD"
  }
};

type MockContractRow = Omit<typeof contractRow, "owner_user_id"> & { owner_user_id: string | null };

let scopedContract: MockContractRow = { ...contractRow };
let requestRow = {
  id: "request-1",
  contract_id: "contract-1",
  organization_id: "org-1",
  requested_to_user_id: "owner-1",
  request_status: "pending"
};

vi.mock("@/lib/auth", () => ({
  requireOrganization
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  requireScopedContract,
  getOrganizationMembers
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/email/send-reminder", () => ({
  sendRenewalActionRequestEmail
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

function makeSupabaseClient() {
  return {
    from(table: string) {
      if (table === "contracts") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: scopedContract, error: null })
              })
            })
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                contractUpdates.push(payload);
                return { error: null };
              }
            })
          })
        };
      }

      if (table === "renewal_action_requests") {
        return {
          insert: (payload: Record<string, unknown>) => ({
            select: () => ({
              single: async () => {
                requestInserts.push(payload);
                return { data: { id: "request-1" }, error: null };
              }
            })
          }),
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({ data: requestRow, error: null })
              })
            })
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                requestUpdates.push(payload);
                return { error: null };
              }
            })
          })
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    }
  };
}

function makeForm(entries: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    formData.append(key, value);
  }
  return formData;
}

describe("renewal owner/request server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contractUpdates.length = 0;
    requestInserts.length = 0;
    requestUpdates.length = 0;
    scopedContract = { ...contractRow };
    requestRow = {
      id: "request-1",
      contract_id: "contract-1",
      organization_id: "org-1",
      requested_to_user_id: "owner-1",
      request_status: "pending"
    };
    requireOrganization.mockResolvedValue({
      user: { id: "operator-1", email: "operator@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
    requireScopedContract.mockResolvedValue({ id: "contract-1", organization_id: "org-1" });
    getOrganizationMembers.mockResolvedValue([
      {
        user_id: "owner-1",
        role: "member",
        user: {
          id: "owner-1",
          full_name: "Finance Owner",
          notification_email: "owner@example.com"
        }
      },
      {
        user_id: "operator-1",
        role: "operator",
        user: {
          id: "operator-1",
          full_name: "Operator",
          notification_email: "operator@example.com"
        }
      }
    ]);
    createServerSupabaseClient.mockReturnValue(makeSupabaseClient());
    createAuditLog.mockResolvedValue({ ok: true });
    sendRenewalActionRequestEmail.mockResolvedValue({ id: "email-1" });
  });

  it("blocks regular members from assigning owners", async () => {
    requireOrganization.mockResolvedValueOnce({
      user: { id: "member-1", email: "member@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    const { assignContractOwnerAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      assignContractOwnerAction("contract-1", makeForm({ owner_user_id: "owner-1" }))
    ).rejects.toThrow("Only owners, admins, or operators can manage renewal owners.");
    expect(contractUpdates).toEqual([]);
  });

  it("requires assigned owners to belong to the active organization", async () => {
    const { assignContractOwnerAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      assignContractOwnerAction("contract-1", makeForm({ owner_user_id: "foreign-user" }))
    ).rejects.toThrow("Owner must be a member of the active organization.");
    expect(contractUpdates).toEqual([]);
  });

  it("audits owner changes with safe metadata", async () => {
    scopedContract = { ...contractRow, owner_user_id: null };
    const { assignContractOwnerAction } = await import("@/lib/actions/contracts/owner-requests");

    await assignContractOwnerAction(
      "contract-1",
      makeForm({ owner_user_id: "owner-1", action_source: "contract_detail" })
    );

    expect(contractUpdates[0]).toEqual({ owner_user_id: "owner-1" });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.owner_assigned",
        details: expect.objectContaining({
          organizationId: "org-1",
          contractId: "contract-1",
          actorUserId: "operator-1",
          newOwnerUserId: "owner-1"
        })
      })
    );
    expect(JSON.stringify(createAuditLog.mock.calls[0]![0].details)).not.toMatch(/raw|payload|secret/i);
  });

  it("creates a pending request and emails only the assigned internal owner", async () => {
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await requestRenewalActionAction(
      "contract-1",
      makeForm({
        due_at: "2030-01-01",
        message: "Please decide renewal path. Vendor email vendor@example.com is intentionally unused."
      })
    );

    expect(requestInserts[0]).toMatchObject({
      organization_id: "org-1",
      contract_id: "contract-1",
      requested_to_user_id: "owner-1",
      request_status: "pending",
      requested_action: "decide_renewal"
    });
    expect(sendRenewalActionRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEmail: "owner@example.com",
        counterpartyName: "Acme"
      })
    );
    expect(sendRenewalActionRequestEmail.mock.calls[0]![0].recipientEmail).not.toBe("vendor@example.com");
  });

  it("handles missing owner email without creating an email send", async () => {
    getOrganizationMembers.mockResolvedValueOnce([
      {
        user_id: "owner-1",
        role: "member",
        user: { id: "owner-1", full_name: "Finance Owner", notification_email: null }
      }
    ]);
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      requestRenewalActionAction("contract-1", makeForm({ due_at: "2030-01-01" }))
    ).rejects.toThrow("Assigned owner does not have a notification email.");
    expect(requestInserts).toEqual([]);
    expect(sendRenewalActionRequestEmail).not.toHaveBeenCalled();
  });

  it("allows the assigned owner to complete their own request", async () => {
    requireOrganization.mockResolvedValueOnce({
      user: { id: "owner-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    const { completeRenewalActionRequestAction } = await import("@/lib/actions/contracts/owner-requests");

    await completeRenewalActionRequestAction(
      "request-1",
      makeForm({ response_status: "renegotiate", response_note: "Need pricing review." })
    );

    expect(requestUpdates[0]).toMatchObject({
      request_status: "completed",
      response_status: "renegotiate",
      response_note: "Need pricing review."
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.action_completed",
        entityId: "request-1"
      })
    );
  });

  it("blocks unrelated members from completing another owner's request", async () => {
    requireOrganization.mockResolvedValueOnce({
      user: { id: "member-2", email: "member2@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    const { completeRenewalActionRequestAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      completeRenewalActionRequestAction("request-1", makeForm({ response_status: "renew" }))
    ).rejects.toThrow("Only the assigned owner or an operator can complete this request.");
    expect(requestUpdates).toEqual([]);
  });
});
