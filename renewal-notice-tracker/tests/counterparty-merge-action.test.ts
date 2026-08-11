import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOrganization = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireOrganization
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

describe("mergeCounterpartyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "ops@example.com" },
      organizationId: "org-1",
      role: "operator"
    });
  });

  it("merges duplicate vendor identities, preserves aliases, and records an audit trail", async () => {
    const contractUpdates: Array<Record<string, unknown>> = [];
    const counterpartyUpdates: Array<Record<string, unknown>> = [];
    const aliasUpserts: Array<Array<Record<string, unknown>>> = [];

    createServerSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "counterparties") {
          return {
            select: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "cp-source",
                        organization_id: "org-1",
                        raw_counterparty_name: "ACME d.o.o.",
                        normalized_counterparty_name: "acme",
                        merged_into_counterparty_id: null
                      },
                      {
                        id: "cp-target",
                        organization_id: "org-1",
                        raw_counterparty_name: "Acme",
                        normalized_counterparty_name: "acme vendor",
                        merged_into_counterparty_id: null
                      }
                    ],
                    error: null
                  })
              })
            }),
            update: (payload: Record<string, unknown>) => {
              counterpartyUpdates.push(payload);
              return {
                eq: () => ({
                  eq: () => Promise.resolve({ error: null })
                })
              };
            }
          };
        }

        if (table === "counterparty_aliases") {
          return {
            select: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      {
                        counterparty_id: "cp-source",
                        alias_name: "Acme Europe",
                        normalized_alias_name: "acme europe"
                      }
                    ],
                    error: null
                  })
              })
            }),
            upsert: (payload: Array<Record<string, unknown>>) => {
              aliasUpserts.push(payload);
              return Promise.resolve({ error: null });
            }
          };
        }

        if (table === "contracts") {
          return {
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

        throw new Error(`Unexpected table ${table}`);
      }
    });

    const { mergeCounterpartyAction } = await import("@/lib/actions/contracts");
    await mergeCounterpartyAction("cp-source", "cp-target");

    expect(contractUpdates).toEqual([{ counterparty_id: "cp-target" }]);
    expect(counterpartyUpdates).toEqual([{ merged_into_counterparty_id: "cp-target" }]);
    expect(aliasUpserts).toEqual([
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: "org-1",
          counterparty_id: "cp-target",
          alias_name: "ACME d.o.o.",
          normalized_alias_name: "acme"
        }),
        expect.objectContaining({
          organization_id: "org-1",
          counterparty_id: "cp-target",
          alias_name: "Acme Europe",
          normalized_alias_name: "acme europe"
        })
      ])
    ]);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "user-1",
        entityId: "cp-source",
        action: "counterparty.merged",
        details: expect.objectContaining({
          merged_into_counterparty_id: "cp-target",
          preserved_aliases: expect.arrayContaining(["ACME d.o.o.", "Acme Europe"])
        })
      })
    );
  }, 15000);

  it("denies cross-org merges and writes no audit entry", async () => {
    createServerSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === "counterparties") {
          return {
            select: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: "cp-source",
                        organization_id: "org-1",
                        raw_counterparty_name: "Acme",
                        normalized_counterparty_name: "acme",
                        merged_into_counterparty_id: null
                      }
                    ],
                    error: null
                  })
              })
            })
          };
        }

        if (table === "counterparty_aliases") {
          return {
            select: () => ({
              eq: () => ({
                in: () => Promise.resolve({ data: [], error: null })
              })
            })
          };
        }

        throw new Error(`Unexpected table ${table}`);
      }
    });

    const { mergeCounterpartyAction } = await import("@/lib/actions/contracts");

    await expect(mergeCounterpartyAction("cp-source", "cp-foreign")).rejects.toThrow(
      "Counterparty not found for active organization."
    );
    expect(createAuditLog).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  }, 15000);
});
