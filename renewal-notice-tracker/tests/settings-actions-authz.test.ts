import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const requireOrganization = vi.fn();
const requireOrgPermission = vi.fn();
const requireShippedRuntimeAction = vi.fn();
const getActiveOrganizationContextOrNull = vi.fn();
const getActiveOrganizationSelectionState = vi.fn();
const getMembershipForOrganization = vi.fn();
const createServerSupabaseClient = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth", () => ({
  requireUser,
  requireOrganization,
  requireOrgPermission,
  requireShippedRuntimeAction,
  getActiveOrganizationContextOrNull,
  getActiveOrganizationSelectionState,
  getMembershipForOrganization,
  OrganizationAuthorizationError: class OrganizationAuthorizationError extends Error {
    constructor(
      public readonly permission: string,
      public readonly role: string
    ) {
      super(`Role "${role}" is not allowed to use permission "${permission}".`);
      this.name = "OrganizationAuthorizationError";
    }
  }
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

vi.mock("next/cache", () => ({
  revalidatePath
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(() => undefined),
    delete: vi.fn()
  })
}));

function createSettingsClient() {
  const organizationUpdates: Array<Record<string, unknown>> = [];
  const organizationUpdateTargets: string[] = [];

  return {
    organizationUpdates,
    organizationUpdateTargets,
    client: {
      from(table: string) {
        if (table === "memberships") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { organization_id: "org-1" }
                    })
                  };
                }
              };
            }
          };
        }

        if (table === "users") {
          return {
            upsert: vi.fn().mockResolvedValue({ error: null })
          };
        }

        if (table === "organizations") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        name: "Current Org",
                        billing_email: "billing@example.com"
                      }
                    })
                  };
                }
              };
            },
            update(payload: Record<string, unknown>) {
              organizationUpdates.push(payload);
              return {
                eq: vi.fn((column: string, organizationId?: string) => {
                  if (column !== "id") {
                    throw new Error(`Unexpected organization filter column: ${column}`);
                  }
                  organizationUpdateTargets.push(organizationId ?? "");
                  return Promise.resolve({ error: null });
                })
              };
            }
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }
    }
  };
}

describe("settings action authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1", email: "member@example.com" });
    requireOrganization.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1", email: "member@example.com" },
      organizationId: "org-1",
      role: "member"
    });
    getActiveOrganizationSelectionState.mockResolvedValue({
      memberships: [{ organization_id: "org-1", role: "member" }],
      activeMembership: { organization_id: "org-1", role: "member" },
      requiresSelection: false,
      hasMemberships: true
    });
    getMembershipForOrganization.mockResolvedValue({
      organization_id: "org-1",
      role: "member"
    });
    requireOrgPermission.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
    requireShippedRuntimeAction.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
  });

  it("rejects direct member attempts to mutate organization settings", async () => {
    const settingsClient = createSettingsClient();
    createServerSupabaseClient.mockReturnValue(settingsClient.client);
    const { saveProfileSettingsAction } = await import("@/lib/actions/settings");
    const formData = new FormData();
    formData.append("full_name", "Member User");
    formData.append("notification_email", "member@example.com");
    formData.append("organization_name", "Changed Org Name");
    formData.append("billing_email", "changed-billing@example.com");

    await expect(saveProfileSettingsAction(formData)).rejects.toThrow(
      'Role "member" is not allowed to use permission "manage_org_settings".'
    );

    expect(settingsClient.organizationUpdates).toHaveLength(0);
    expect(createAuditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: "settings.updated" })
    );
  });

  it("does not trust a posted organization id without validating membership", async () => {
    getMembershipForOrganization.mockResolvedValueOnce(null);
    const { setActiveOrganizationAction } = await import("@/lib/actions/settings");
    const formData = new FormData();
    formData.append("organization_id", "foreign-org");

    await expect(setActiveOrganizationAction(formData)).rejects.toThrow(
      "You do not have access to that organization."
    );

    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("keeps workspace deletion owner-only in backend enforcement", async () => {
    requireShippedRuntimeAction.mockRejectedValue(new Error("REDIRECT:/dashboard"));
    const { requestWorkspaceDeletionAction } = await import("@/lib/actions/settings");

    await expect(requestWorkspaceDeletionAction()).rejects.toThrow("REDIRECT:/dashboard");
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("uses the active organization context for org-level settings writes", async () => {
    const settingsClient = createSettingsClient();
    createServerSupabaseClient.mockReturnValue(settingsClient.client);
    getActiveOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      organizationId: "org-active",
      role: "admin"
    });
    getActiveOrganizationSelectionState.mockResolvedValue({
      memberships: [{ organization_id: "org-active", role: "admin" }],
      activeMembership: { organization_id: "org-active", role: "admin" },
      requiresSelection: false,
      hasMemberships: true
    });
    const { saveProfileSettingsAction } = await import("@/lib/actions/settings");
    const formData = new FormData();
    formData.append("full_name", "Admin User");
    formData.append("notification_email", "admin@example.com");
    formData.append("organization_name", "Current Org");
    formData.append("billing_email", "billing@example.com");

    await saveProfileSettingsAction(formData);

    expect(settingsClient.organizationUpdateTargets).toEqual(["org-active"]);
  });

  it("does not treat a multi-org user without an active org as a brand-new workspace signup", async () => {
    const settingsClient = createSettingsClient();
    createServerSupabaseClient.mockReturnValue(settingsClient.client);
    getActiveOrganizationContextOrNull.mockResolvedValue(null);
    getActiveOrganizationSelectionState.mockResolvedValue({
      memberships: [
        { organization_id: "org-1", role: "admin" },
        { organization_id: "org-2", role: "operator" }
      ],
      activeMembership: null,
      requiresSelection: true,
      hasMemberships: true
    });

    const { saveProfileSettingsAction } = await import("@/lib/actions/settings");
    const formData = new FormData();
    formData.append("full_name", "Admin User");
    formData.append("notification_email", "admin@example.com");
    formData.append("organization_name", "Should Not Create");
    formData.append("billing_email", "billing@example.com");

    await expect(saveProfileSettingsAction(formData)).rejects.toThrow(
      "Select an active organization before updating workspace settings."
    );
  });
});
