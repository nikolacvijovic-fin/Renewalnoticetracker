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

  it("keeps admin operational snapshots count-oriented, bounded, and lease-configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T12:00:00.000Z"));
    vi.stubEnv("REMINDER_PROCESSING_LEASE_MINUTES", "7");
    vi.stubEnv("OCR_PROCESSING_LEASE_MINUTES", "11");
    vi.resetModules();

    const selectCalls: Array<{
      table: string;
      selection: string;
      options?: { count?: string; head?: boolean };
    }> = [];
    const eqCalls: Array<[string, string, string]> = [];
    const ltCalls: Array<[string, string, string]> = [];
    const limitCalls: Array<[string, number]> = [];

    function makeSnapshotQuery(table: string) {
      const chain = {
        select(selection: string, options?: { count?: string; head?: boolean }) {
          selectCalls.push({ table, selection, options });
          return chain;
        },
        eq(column: string, value: string) {
          eqCalls.push([table, column, value]);
          return chain;
        },
        in() {
          return chain;
        },
        gte() {
          return chain;
        },
        lt(column: string, value: string) {
          ltCalls.push([table, column, value]);
          return chain;
        },
        order() {
          return chain;
        },
        limit(limit: number) {
          limitCalls.push([table, limit]);
          return Promise.resolve({ data: [], error: null });
        },
        then(resolve: (value: { count: number; data: never[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ count: 0, data: [], error: null }));
        }
      };
      return chain;
    }

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        return makeSnapshotQuery(table);
      }
    });

    try {
      const { getAdminOperationalSnapshot } = await import("@/lib/contracts/queries");
      const snapshot = await getAdminOperationalSnapshot("org-tenant-safe");

      expect(snapshot.exportJobHealth).toEqual(
        expect.objectContaining({
          queued: 0,
          processing: 0,
          staleProcessing: 0
        })
      );
      expect(snapshot.ocrJobHealth).toEqual(
        expect.objectContaining({
          queued: 0,
          processing: 0,
          staleProcessing: 0
        })
      );
      expect(
        selectCalls.filter((call) => call.options?.count === "exact" && call.options?.head === true)
          .length
      ).toBeGreaterThanOrEqual(20);
      expect(limitCalls).toEqual(
        expect.arrayContaining([
          ["data_export_requests", 25],
          ["data_export_requests", 1],
          ["ocr_jobs", 1],
          ["reminders", 10],
          ["notification_logs", 15]
        ])
      );
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ["contracts", "organization_id", "org-tenant-safe"],
          ["reminders", "organization_id", "org-tenant-safe"],
          ["notification_logs", "organization_id", "org-tenant-safe"],
          ["data_export_requests", "organization_id", "org-tenant-safe"],
          ["ocr_jobs", "organization_id", "org-tenant-safe"]
        ])
      );
      expect(ltCalls).toContainEqual([
        "reminders",
        "processing_started_at",
        "2026-06-05T11:53:00.000Z"
      ]);
      expect(ltCalls).toContainEqual([
        "ocr_jobs",
        "started_at",
        "2026-06-05T11:49:00.000Z"
      ]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.resetModules();
    }
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

  it("paginates export rows with org scope, stable ordering, and scoped owner labels", async () => {
    const fromCalls: string[] = [];
    const contractFilters: Array<[string, string]> = [];
    const memberFilters: Array<[string, string]> = [];
    const ranges: Array<[number, number]> = [];
    const orderCalls: Array<[string, Record<string, boolean> | undefined]> = [];

    createServerSupabaseClient.mockReturnValue({
      from(table: string) {
        fromCalls.push(table);
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

        if (table === "contracts") {
          return {
            select(_selection: string, _options?: { count?: string }) {
              return {
                eq(column: string, value: string) {
                  contractFilters.push([column, value]);
                  return this;
                },
                order(column: string, options?: Record<string, boolean>) {
                  orderCalls.push([column, options]);
                  return this;
                },
                async range(start: number, end: number) {
                  ranges.push([start, end]);
                  const dataByStart: Record<number, unknown[]> = {
                    0: [
                      {
                        id: "contract-1",
                        owner_user_id: "owner-1",
                        contract_metadata: { contract_title: "MSA 1" }
                      },
                      {
                        id: "contract-2",
                        owner_user_id: "owner-1",
                        contract_metadata: { contract_title: "MSA 2" }
                      }
                    ],
                    2: [
                      {
                        id: "contract-3",
                        owner_user_id: "owner-1",
                        contract_metadata: { contract_title: "MSA 3" }
                      }
                    ]
                  };
                  return {
                    count: start === 0 ? 3 : null,
                    data: dataByStart[start] ?? [],
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

    const { iterateExportRows } = await import("@/lib/contracts/kernel-queries");
    const pages = [];
    for await (const page of iterateExportRows("org-tenant-safe", "basic_contract_register", {
      pageSize: 2,
      maxRows: 10
    })) {
      pages.push(page);
    }

    expect(fromCalls).toEqual(["memberships", "contracts", "contracts"]);
    expect(fromCalls).not.toContain("users");
    expect(memberFilters).toContainEqual(["organization_id", "org-tenant-safe"]);
    expect(contractFilters).toEqual([
      ["organization_id", "org-tenant-safe"],
      ["organization_id", "org-tenant-safe"]
    ]);
    expect(orderCalls).toEqual([
      ["updated_at", { ascending: false }],
      ["id", { ascending: true }],
      ["updated_at", { ascending: false }],
      ["id", { ascending: true }]
    ]);
    expect(ranges).toEqual([
      [0, 1],
      [2, 3]
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual(
      expect.objectContaining({
        pageIndex: 0,
        pageSize: 2,
        rowOffset: 0,
        totalRowCount: 3
      })
    );
    expect(pages.flatMap((page) => page.rows).map((row) => row.owner_name)).toEqual([
      "Jane Owner",
      "Jane Owner",
      "Jane Owner"
    ]);
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
