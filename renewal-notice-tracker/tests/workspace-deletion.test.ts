import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

function createAdminMock(options?: {
  requestStatus?: string;
}) {
  const calls: string[] = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const responseFor = (table: string) => {
    switch (table) {
      case "deletion_requests":
        return {
          maybeSingle: {
            id: "delete-1",
            organization_id: "org-1",
            actor_user_id: "user-1",
            status: options?.requestStatus ?? "requested",
            evidence_json: {}
          }
        };
      case "memberships":
        return { data: [{ user_id: "user-1" }, { user_id: "user-2" }] };
      case "contracts":
        return { data: [{ id: "contract-1" }, { id: "contract-2" }] };
      case "contract_metadata":
        return { data: [{ id: "metadata-1" }, { id: "metadata-2" }] };
      default:
        return { data: [] };
    }
  };

  const admin = {
    from(table: string) {
      const buildTerminal = () => ({
        eq(_column: string, _value: unknown) {
          return this;
        },
        in(_column: string, _value: unknown[]) {
          return this;
        },
        then(resolve: (value: unknown) => unknown) {
          calls.push(`${table}:await`);
          return Promise.resolve(
            resolve({
              data: responseFor(table).data ?? [],
              error: null
            })
          );
        },
        async maybeSingle() {
          calls.push(`${table}:maybeSingle`);
          return {
            data: responseFor(table).maybeSingle ?? null,
            error: null
          };
        }
      });

      return {
        select(_columns?: string) {
          calls.push(`${table}:select`);
          return buildTerminal();
        },
        update(payload: Record<string, unknown>) {
          updates.push({ table, payload });
          calls.push(`${table}:update`);
          return {
            eq(_column: string, _value: unknown) {
              return this;
            }
          };
        },
        delete() {
          calls.push(`${table}:delete`);
          return {
            eq(_column: string, _value: unknown) {
              return this;
            },
            in(_column: string, _value: unknown[]) {
              return this;
            }
          };
        }
      };
    }
  };

  return { admin, calls, updates };
}

describe("workspace deletion execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when a deletion request is already completed", async () => {
    const mock = createAdminMock({ requestStatus: "completed" });
    createAdminSupabaseClient.mockReturnValue(mock.admin);

    const { executeWorkspaceDeletionRequest } = await import("@/lib/organization/workspace-deletion");
    const result = await executeWorkspaceDeletionRequest("delete-1");

    expect(result.status).toBe("already_completed");
    expect(mock.calls.filter((entry) => entry.endsWith(":delete")).length).toBe(0);
  });

  it("purges org-scoped data, clears defaults, and tombstones the organization", async () => {
    const mock = createAdminMock();
    createAdminSupabaseClient.mockReturnValue(mock.admin);

    const { executeWorkspaceDeletionRequest } = await import("@/lib/organization/workspace-deletion");
    const result = await executeWorkspaceDeletionRequest("delete-1");

    expect(result.status).toBe("completed");
    expect(result.contractCount).toBe(2);
    expect(mock.calls).toContain("contracts:delete");
    expect(mock.calls).toContain("memberships:delete");
    expect(mock.calls).toContain("data_export_requests:delete");
    expect(mock.calls).toContain("ocr_jobs:delete");
    expect(
      mock.updates.some(
        (entry) =>
          entry.table === "organizations" &&
          entry.payload.name === "Deleted workspace org-1"
      )
    ).toBe(true);
    expect(
      mock.updates.some(
        (entry) => entry.table === "deletion_requests" && entry.payload.status === "completed"
      )
    ).toBe(true);
  });

  it("purges OCR jobs and preserves execution counts in deletion evidence", async () => {
    const mock = createAdminMock();
    createAdminSupabaseClient.mockReturnValue(mock.admin);

    const { executeWorkspaceDeletionRequest } = await import("@/lib/organization/workspace-deletion");
    await executeWorkspaceDeletionRequest("delete-1");

    const completionUpdate = mock.updates.find(
      (entry) => entry.table === "deletion_requests" && entry.payload.status === "completed"
    );

    expect(mock.calls).toContain("ocr_jobs:delete");
    expect(completionUpdate?.payload.evidence_json).toEqual(
      expect.objectContaining({
        execution: expect.objectContaining({
          contract_count: 2,
          metadata_count: 2,
          membership_count: 2
        })
      })
    );
  });
});
