import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

function createQueryBuilder(result: { data?: unknown; error?: unknown } = {}) {
  return {
    select: vi.fn(() => createQueryBuilder(result)),
    eq: vi.fn((_column: string, _value: string) => createQueryBuilder(result)),
    in: vi.fn(() => createQueryBuilder(result)),
    order: vi.fn(() => createQueryBuilder(result)),
    limit: vi.fn(() => createQueryBuilder(result)),
    maybeSingle: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null
    }),
    single: vi.fn().mockResolvedValue({
      data: result.data ?? null,
      error: result.error ?? null
    })
  };
}

describe("contract query authz scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it(
    "scopes contract detail lookups by both contract id and organization id",
    async () => {
    const eqCalls: Array<[string, string]> = [];
    const contractQuery = {
      select: vi.fn(() => ({
        eq(column: string, value: string) {
          eqCalls.push([column, value]);
          return this;
        },
        single: vi.fn().mockResolvedValue({
          data: {
            id: "contract-1",
            contract_files: [],
            contract_metadata: null,
            reminders: [],
            notes: [],
            audit_logs: [],
            renewal_decisions: [],
            playbook_runs: []
          },
          error: null
        })
      }))
    };

    const evidenceQuery = createQueryBuilder({ data: [] });
    const processingErrorsQuery = createQueryBuilder({ data: [] });

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        if (table === "contracts") return contractQuery;
        if (table === "processing_errors") return processingErrorsQuery;
        if (table === "extracted_field_evidence") return evidenceQuery;
        throw new Error(`Unexpected table: ${table}`);
      }
    });

    const { getContractById } = await import("@/lib/contracts/queries");
    await getContractById("contract-1", "org-tenant-safe");

    expect(eqCalls).toContainEqual(["id", "contract-1"]);
    expect(eqCalls).toContainEqual(["organization_id", "org-tenant-safe"]);
    },
    15000
  );

  it("scopes admin debug notification and import job reads to the active organization", async () => {
    const filters: Record<string, Array<[string, string]>> = {
      reminders: [],
      notification_logs: [],
      processing_errors: [],
      import_jobs: []
    };

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        return {
          select() {
            return {
              eq(column: string, value: string) {
                filters[table]?.push([column, value]);
                return this;
              },
              in() {
                return this;
              },
              order() {
                return this;
              },
              limit() {
                return Promise.resolve({ data: [], error: null });
              }
            };
          }
        };
      }
    });

    const { getAdminDebugData } = await import("@/lib/contracts/queries");
    await getAdminDebugData("org-tenant-safe");

    expect(filters.notification_logs).toContainEqual(["organization_id", "org-tenant-safe"]);
    expect(filters.import_jobs).toContainEqual(["organization_id", "org-tenant-safe"]);
  });

  it("loads organization members through org-scoped memberships instead of global users", async () => {
    const fromCalls: string[] = [];
    const selectCalls: Array<[string, string]> = [];
    const eqCalls: Array<[string, string, string]> = [];

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        fromCalls.push(table);
        return {
          select(selection: string) {
            selectCalls.push([table, selection]);
            return {
              async eq(column: string, value: string) {
                eqCalls.push([table, column, value]);
                return {
                  data: [
                    {
                      user_id: "owner-1",
                      role: "owner",
                      user: {
                        id: "owner-1",
                        full_name: "Jane Owner",
                        notification_email: "owner@example.com"
                      }
                    }
                  ],
                  error: null
                };
              }
            };
          }
        };
      }
    });

    const { getOrganizationMembers } = await import("@/lib/contracts/kernel-queries");
    const members = await getOrganizationMembers("org-tenant-safe");

    expect(fromCalls).toEqual(["memberships"]);
    expect(selectCalls).toContainEqual([
      "memberships",
      "user_id, role, user:users(id, full_name, notification_email)"
    ]);
    expect(eqCalls).toContainEqual(["memberships", "organization_id", "org-tenant-safe"]);
    expect(members).toEqual([
      expect.objectContaining({
        user_id: "owner-1",
        user: expect.objectContaining({
          full_name: "Jane Owner"
        })
      })
    ]);
  });

  it("resolves export owner labels without loading global users and preserves row limits", async () => {
    const fromCalls: string[] = [];
    const contractFilters: Array<[string, string]> = [];
    const memberFilters: Array<[string, string]> = [];
    const ranges: Array<[number, number]> = [];

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        fromCalls.push(table);
        if (table === "contracts") {
          return {
            select(_selection: string, options?: { count?: string }) {
              expect(options).toEqual({ count: "exact" });
              return {
                eq(column: string, value: string) {
                  contractFilters.push([column, value]);
                  return this;
                },
                order() {
                  return this;
                },
                async range(start: number, end: number) {
                  ranges.push([start, end]);
                  return {
                    count: 1,
                    data: [
                      {
                        id: "contract-1",
                        owner_user_id: "owner-1",
                        department: "Legal",
                        status_tag: "active",
                        contract_metadata: {
                          contract_title: "MSA",
                          counterparty_name: "Acme",
                          contract_type: "MSA",
                          renewal_date: "2026-12-01",
                          expiration_date: "2026-12-31",
                          notice_deadline_date: "2026-11-01",
                          auto_renewal: true,
                          payment_terms: "Net 30",
                          needs_review: false
                        }
                      }
                    ],
                    error: null
                  };
                }
              };
            }
          };
        }

        if (table === "memberships") {
          return {
            select(selection: string) {
              expect(selection).toBe("user_id, role, user:users(id, full_name, notification_email)");
              return {
                async eq(column: string, value: string) {
                  memberFilters.push([column, value]);
                  return {
                    data: [
                      {
                        user_id: "owner-1",
                        role: "owner",
                        user: {
                          id: "owner-1",
                          full_name: "Jane Owner",
                          notification_email: "owner@example.com"
                        }
                      }
                    ],
                    error: null
                  };
                }
              };
            }
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }
    });

    const { getExportRows } = await import("@/lib/contracts/kernel-queries");
    const rows = await getExportRows("org-tenant-safe", "basic_contract_register");

    expect(fromCalls).toEqual(["contracts", "memberships"]);
    expect(fromCalls).not.toContain("users");
    expect(contractFilters).toContainEqual(["organization_id", "org-tenant-safe"]);
    expect(memberFilters).toContainEqual(["organization_id", "org-tenant-safe"]);
    expect(ranges).toContainEqual([0, 4999]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        contract_title: "MSA",
        owner_name: "Jane Owner"
      })
    );
  });

  it("keeps legacy contract member helper scoped to memberships without global user scans", async () => {
    const fromCalls: string[] = [];

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        fromCalls.push(table);
        return {
          select(selection: string) {
            expect(selection).toBe(
              "user_id, role, user:users(id, full_name, notification_email, monthly_digest_enabled)"
            );
            return {
              async eq(column: string, value: string) {
                expect([column, value]).toEqual(["organization_id", "org-tenant-safe"]);
                return {
                  data: [
                    {
                      user_id: "operator-1",
                      role: "operator",
                      user: {
                        id: "operator-1",
                        full_name: "Ops User",
                        notification_email: "ops@example.com",
                        monthly_digest_enabled: true
                      }
                    }
                  ],
                  error: null
                };
              }
            };
          }
        };
      }
    });

    const { getOrganizationMembers } = await import("@/lib/contracts/queries");
    const members = await getOrganizationMembers("org-tenant-safe");

    expect(fromCalls).toEqual(["memberships"]);
    expect(fromCalls).not.toContain("users");
    expect(members[0]?.user?.notification_email).toBe("ops@example.com");
  });
});
