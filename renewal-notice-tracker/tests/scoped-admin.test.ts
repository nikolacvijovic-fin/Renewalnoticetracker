import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

function createReminderLookupClient() {
  return {
    from(table: string) {
      expect(table).toBe("reminders");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              expect([
                ["id", "reminder-1"],
                ["organization_id", "org-2"]
              ]).toContainEqual([column, value]);
              return this;
            },
            async single() {
              return {
                data: null,
                error: { message: "No rows found" }
              };
            }
          };
        }
      };
    }
  };
}

function createNotificationLookupClient() {
  return {
    from(table: string) {
      expect(table).toBe("notification_logs");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              expect([
                ["id", "log-1"],
                ["organization_id", "org-2"]
              ]).toContainEqual([column, value]);
              return this;
            },
            async single() {
              return {
                data: null,
                error: { message: "No rows found" }
              };
            }
          };
        }
      };
    }
  };
}

describe("scoped admin helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects reminder lookups when the reminder id belongs to another organization", async () => {
    createAdminSupabaseClient.mockReturnValue(createReminderLookupClient());
    const { getScopedReminderById } = await import("@/lib/organization/scoped-admin");

    await expect(getScopedReminderById("reminder-1", "org-2")).rejects.toEqual({
      message: "No rows found"
    });
  });

  it("rejects notification log lookups when the log id belongs to another organization", async () => {
    createAdminSupabaseClient.mockReturnValue(createNotificationLookupClient());
    const { getScopedNotificationLogById } = await import("@/lib/organization/scoped-admin");

    await expect(getScopedNotificationLogById("log-1", "org-2")).rejects.toEqual({
      message: "No rows found"
    });
  });
});
