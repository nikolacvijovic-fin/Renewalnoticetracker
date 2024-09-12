import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerSupabaseClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient
}));

function makeBuilder(table: string, calls: Array<{ table: string; column: string; value: string }>) {
  let singleRow: Record<string, unknown> | null = null;
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      calls.push({ table, column, value });
      if (column === "id" && value === "gate-1") {
        singleRow = {
          id: "gate-1",
          organization_id: "org-1",
          contract_id: "contract-1",
          actor_user_id: "user-1",
          event_type: "trusted_reminder_gate.blocked",
          event_source: "trusted_reminder_gate",
          metadata: { status: "blocked" },
          created_at: "2026-07-01T00:00:00.000Z"
        };
      }
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
    })),
    maybeSingle: vi.fn(async () => ({ data: singleRow, error: null }))
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

  it("looks up a normalized source:id by exact source and organization", async () => {
    const calls: Array<{ table: string; column: string; value: string }> = [];
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => makeBuilder(table, calls))
      }))
    });

    const { getEnterpriseAuditEventById } = await import("@/lib/enterprise-audit/audit-queries");
    const event = await getEnterpriseAuditEventById({
      organizationId: "org-1",
      normalizedEventId: "trusted_reminder_gate_events:gate-1"
    });

    expect(event).toMatchObject({
      id: "trusted_reminder_gate_events:gate-1",
      organizationId: "org-1",
      eventCategory: "trusted_reminder"
    });
    expect(calls).toEqual(
      expect.arrayContaining([
        { table: "trusted_reminder_gate_events", column: "organization_id", value: "org-1" },
        { table: "trusted_reminder_gate_events", column: "id", value: "gate-1" }
      ])
    );
  });

  it("rejects invalid normalized event ids", async () => {
    const { getEnterpriseAuditEventById } = await import("@/lib/enterprise-audit/audit-queries");

    await expect(
      getEnterpriseAuditEventById({
        organizationId: "org-1",
        normalizedEventId: "unknown:gate-1"
      })
    ).resolves.toBeNull();
  });

  it("labels category and actor counts as partial when based on capped samples", async () => {
    const calls: Array<{ table: string; column: string; value: string }> = [];
    createServerSupabaseClient.mockReturnValue({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => makeBuilder(table, calls))
      }))
    });

    const { getAuditEventCountsByCategory, getAuditEventCountsByActor, ENTERPRISE_AUDIT_LIMIT_CAP } =
      await import("@/lib/enterprise-audit/audit-queries");

    await expect(getAuditEventCountsByCategory({ organizationId: "org-1" })).resolves.toMatchObject({
      counts: { trusted_reminder: 1 },
      isPartial: true,
      sampleLimit: ENTERPRISE_AUDIT_LIMIT_CAP
    });
    await expect(getAuditEventCountsByActor({ organizationId: "org-1" })).resolves.toMatchObject({
      counts: { "user-1": 1 },
      isPartial: true,
      sampleLimit: ENTERPRISE_AUDIT_LIMIT_CAP
    });
  });
});
