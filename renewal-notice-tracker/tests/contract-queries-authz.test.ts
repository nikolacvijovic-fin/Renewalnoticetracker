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
});
