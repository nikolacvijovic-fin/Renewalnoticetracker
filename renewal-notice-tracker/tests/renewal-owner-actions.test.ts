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
const rpcCalls: Array<{ functionName: string; args: Record<string, unknown> }> = [];

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
    contract_value_currency: "USD",
    needs_review: false
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
let createRequestRpcCreated = true;

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
    rpc: async (functionName: string, args: Record<string, unknown>) => {
      rpcCalls.push({ functionName, args });
      if (functionName === "assign_contract_owner_and_expire_requests") {
        const previous = scopedContract.owner_user_id;
        scopedContract = {
          ...scopedContract,
          owner_user_id: (args.p_new_owner_user_id as string | null) ?? null
        };
        return {
          data: [
            {
              contract_id: "contract-1",
              organization_id: "org-1",
              previous_owner_user_id: previous,
              new_owner_user_id: scopedContract.owner_user_id,
              expired_request_ids: previous ? ["request-1"] : [],
              expired_count: previous ? 1 : 0
            }
          ],
          error: null
        };
      }

      if (functionName === "create_renewal_action_request") {
        requestInserts.push(args);
        return {
          data: [
            {
              id: "request-1",
              contract_id: "contract-1",
              organization_id: "org-1",
              requested_to_user_id: "owner-1",
              request_status: "pending",
              requested_action: "decide_renewal",
              due_date: args.p_due_date,
              due_at: `${args.p_due_date}T00:00:00.000Z`,
              created: createRequestRpcCreated
            }
          ],
          error: null
        };
      }

      if (functionName === "respond_renewal_action_request") {
        requestUpdates.push(args);
        if (requestRow.request_status !== "pending") {
          return { data: null, error: { message: "Renewal action request is no longer pending." } };
        }
        requestRow = {
          ...requestRow,
          request_status: args.p_target_status as string
        };
        return {
          data: [
            {
              id: "request-1",
              contract_id: "contract-1",
              organization_id: "org-1",
              requested_to_user_id: "owner-1",
              request_status: args.p_target_status,
              response_status: args.p_response_status,
              completed_at: "2030-01-01T12:00:00.000Z",
              transitioned: true
            }
          ],
          error: null
        };
      }

      if (functionName === "expire_renewal_action_request") {
        requestUpdates.push(args);
        if (requestRow.request_status !== "pending") {
          return { data: null, error: { message: "Renewal action request is no longer pending." } };
        }
        requestRow = {
          ...requestRow,
          request_status: "expired"
        };
        return {
          data: [
            {
              id: "request-1",
              contract_id: "contract-1",
              organization_id: "org-1",
              requested_to_user_id: "owner-1",
              request_status: "expired",
              completed_at: "2030-01-01T12:00:00.000Z",
              transitioned: true
            }
          ],
          error: null
        };
      }

      throw new Error(`Unexpected rpc: ${functionName}`);
    },
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
    rpcCalls.length = 0;
    scopedContract = { ...contractRow };
    requestRow = {
      id: "request-1",
      contract_id: "contract-1",
      organization_id: "org-1",
      requested_to_user_id: "owner-1",
      request_status: "pending"
    };
    createRequestRpcCreated = true;
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

    expect(contractUpdates).toEqual([]);
    expect(rpcCalls[0]).toEqual({
      functionName: "assign_contract_owner_and_expire_requests",
      args: {
        p_contract_id: "contract-1",
        p_new_owner_user_id: "owner-1"
      }
    });
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

  it("expires previous-owner pending requests when the owner changes", async () => {
    const { assignContractOwnerAction } = await import("@/lib/actions/contracts/owner-requests");

    await assignContractOwnerAction(
      "contract-1",
      makeForm({ owner_user_id: "operator-1", action_source: "contract_detail" })
    );

    expect(rpcCalls[0]).toEqual({
      functionName: "assign_contract_owner_and_expire_requests",
      args: {
        p_contract_id: "contract-1",
        p_new_owner_user_id: "operator-1"
      }
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.action_expired",
        details: expect.objectContaining({
          previousOwnerUserId: "owner-1",
          newOwnerUserId: "operator-1",
          expiredRequestIds: ["request-1"],
          expiredRequestCount: 1,
          requestStatus: "expired"
        })
      })
    );
  });

  it("creates a pending request and leaves email delivery to the outbox", async () => {
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await requestRenewalActionAction(
      "contract-1",
      makeForm({
        due_date: "2030-01-01",
        message: "Please decide renewal path. Vendor email vendor@example.com is intentionally unused."
      })
    );

    expect(requestInserts[0]).toMatchObject({
      p_contract_id: "contract-1",
      p_due_date: "2030-01-01"
    });
    expect(rpcCalls.map((call) => call.functionName)).toContain("create_renewal_action_request");
    expect(sendRenewalActionRequestEmail).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.action_requested",
        entityId: "request-1",
        details: expect.objectContaining({
          dueDate: "2030-01-01",
          messageLength: expect.any(Number)
        })
      })
    );
  });

  it("audits the business request even when the email provider would fail", async () => {
    sendRenewalActionRequestEmail.mockRejectedValueOnce(new Error("provider failure"));
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await requestRenewalActionAction("contract-1", makeForm({ due_date: "2030-01-01" }));

    expect(requestInserts).toHaveLength(1);
    expect(sendRenewalActionRequestEmail).not.toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.action_requested",
        entityId: "request-1"
      })
    );
  });

  it("does not duplicate email or audit when a pending request already exists", async () => {
    createRequestRpcCreated = false;
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await requestRenewalActionAction("contract-1", makeForm({ due_date: "2030-01-01" }));

    expect(requestInserts).toHaveLength(1);
    expect(sendRenewalActionRequestEmail).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("rejects due dates after the trusted notice deadline before creating a request", async () => {
    const { requestRenewalActionAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      requestRenewalActionAction("contract-1", makeForm({ due_date: "2030-01-02" }))
    ).rejects.toThrow("Due date cannot be after the trusted notice deadline.");
    expect(requestInserts).toEqual([]);
    expect(sendRenewalActionRequestEmail).not.toHaveBeenCalled();
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
      requestRenewalActionAction("contract-1", makeForm({ due_date: "2030-01-01" }))
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
      p_request_id: "request-1",
      p_target_status: "completed",
      p_response_status: "renegotiate",
      p_response_note: "Need pricing review."
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "renewal.action_completed",
        entityId: "request-1"
      })
    );
  });

  it("does not write success audit logs for stale completed requests", async () => {
    requestRow = {
      ...requestRow,
      request_status: "completed"
    };
    requireOrganization.mockResolvedValueOnce({
      user: { id: "owner-1", email: "owner@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    const { completeRenewalActionRequestAction } = await import("@/lib/actions/contracts/owner-requests");

    await expect(
      completeRenewalActionRequestAction("request-1", makeForm({ response_status: "renew" }))
    ).rejects.toThrow("Renewal action request is no longer pending.");
    expect(createAuditLog).not.toHaveBeenCalled();
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
