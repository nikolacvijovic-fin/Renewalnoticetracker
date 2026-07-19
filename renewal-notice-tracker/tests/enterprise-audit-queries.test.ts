import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

function makeBuilder(table: string, calls: Array<{ table: string; column: string; value: string }>) {
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      calls.push({ table, column, value });
      return builder;
    }),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(async (limit: number) => ({
      error: null,
      data:
        table === "trusted_reminder_gate_events"
          ? [
              {
                id: "gate-1",
                organization_id: "org-1",
                contract_id: "contract-1",
                actor_user_id: "user-1",
                event_type: "trusted_reminder_gate.blocked",
                event_source: "trusted_reminder_gate",
                metadata: { status: "blocked", limit },
                created_at: "2026-07-01T00:00:00.000Z"
              }
            ]
          : []
    }))
  };
  return builder;
}

describe("enterprise audit queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("scopes every source query to organization and caps limits", async () => {
    const calls: Array<{ table: string; column: string; value: string }> = [];
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => makeBuilder(table, calls))
      }))
    });

    const { getEnterpriseAuditEvents, ENTERPRISE_AUDIT_LIMIT_CAP } = await import(
      "@/lib/enterprise-audit/audit-queries"
    );
    const result = await getEnterpriseAuditEvents({
      organizationId: "org-1",
      limit: 999,
      trustSensitiveOnly: true
    });

    expect(result.limit).toBe(ENTERPRISE_AUDIT_LIMIT_CAP);
    expect(result.events).toHaveLength(1);
    expect(calls.filter((call) => call.column === "organization_id")).toHaveLength(6);
    expect(calls.every((call) => call.value === "org-1")).toBe(true);
  });

  it("filters contract timelines to trust-relevant normalized events", async () => {
    const calls: Array<{ table: string; column: string; value: string }> = [];
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => makeBuilder(table, calls))
      }))
    });

    const { getContractAuditTimeline } = await import("@/lib/enterprise-audit/audit-queries");
    const events = await getContractAuditTimeline({
      organizationId: "org-1",
      contractId: "contract-1"
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.eventCategory).toBe("trusted_reminder");
    expect(calls).toEqual(
      expect.arrayContaining([
        { table: "trusted_reminder_gate_events", column: "contract_id", value: "contract-1" }
      ])
    );
  });
});
