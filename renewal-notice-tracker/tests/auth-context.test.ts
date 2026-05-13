import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((location: string) => {
  throw new Error(`REDIRECT:${location}`);
});

const createServerSupabaseClient = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

function createSupabaseStub(input: {
  user: { id: string } | null;
  defaultOrganizationId?: string | null;
  memberships: Array<{ organization_id: string; role: string }>;
}) {
  const userUpdates: Array<Record<string, unknown>> = [];

  return {
    userUpdates,
    client: {
      auth: {
        async getUser() {
          return {
            data: {
              user: input.user
            }
          };
        }
      },
      from(table: string) {
        if (table === "users") {
          return {
            select() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return {
                        data: {
                          default_organization_id: input.defaultOrganizationId ?? null
                        },
                        error: null
                      };
                    }
                  };
                }
              };
            },
            update(payload: Record<string, unknown>) {
              userUpdates.push(payload);
              return {
                eq() {
                  return Promise.resolve({ error: null });
                }
              };
            }
          };
        }

        if (table === "memberships") {
          return {
            select() {
              return {
                eq() {
                  return Promise.resolve({
                    data: input.memberships,
                    error: null
                  });
                }
              };
            }
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }
    }
  };
}

describe("auth active organization context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("persists the sole membership as the default active organization", async () => {
    const supabaseStub = createSupabaseStub({
      user: { id: "user-1" },
      defaultOrganizationId: null,
      memberships: [{ organization_id: "org-1", role: "owner" }]
    });
    createServerSupabaseClient.mockReturnValue(supabaseStub.client);

    const { requireOrganization } = await import("@/lib/auth");
    const context = await requireOrganization();

    expect(context).toEqual({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
    expect(supabaseStub.userUpdates).toContainEqual({
      default_organization_id: "org-1"
    });
  });

  it("redirects multi-org users to explicit active-organization selection when none is set", async () => {
    const supabaseStub = createSupabaseStub({
      user: { id: "user-1" },
      defaultOrganizationId: null,
      memberships: [
        { organization_id: "org-1", role: "owner" },
        { organization_id: "org-2", role: "admin" }
      ]
    });
    createServerSupabaseClient.mockReturnValue(supabaseStub.client);

    const { requireOrganization } = await import("@/lib/auth");

    await expect(requireOrganization()).rejects.toThrow(
      "REDIRECT:/dashboard/settings?setup=active-organization"
    );
    expect(supabaseStub.userUpdates).toHaveLength(0);
  });

  it("repairs a stale default organization by falling back to the sole valid membership", async () => {
    const supabaseStub = createSupabaseStub({
      user: { id: "user-1" },
      defaultOrganizationId: "org-stale",
      memberships: [{ organization_id: "org-1", role: "admin" }]
    });
    createServerSupabaseClient.mockReturnValue(supabaseStub.client);

    const { requireActiveOrganization } = await import("@/lib/auth");
    const context = await requireActiveOrganization();

    expect(context).toEqual({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "admin"
    });
    expect(supabaseStub.userUpdates).toEqual([
      { default_organization_id: null },
      { default_organization_id: "org-1" }
    ]);
  });

  it("returns null instead of redirecting when a multi-org user has no active organization selected", async () => {
    const supabaseStub = createSupabaseStub({
      user: { id: "user-1" },
      defaultOrganizationId: null,
      memberships: [
        { organization_id: "org-1", role: "owner" },
        { organization_id: "org-2", role: "admin" }
      ]
    });
    createServerSupabaseClient.mockReturnValue(supabaseStub.client);

    const { getActiveOrganizationContextOrNull } = await import("@/lib/auth");
    const context = await getActiveOrganizationContextOrNull();

    expect(context).toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
