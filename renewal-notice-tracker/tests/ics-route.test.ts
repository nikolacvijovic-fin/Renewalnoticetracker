import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getContractCalendarEvents = vi.fn();
const buildCalendar = vi.fn();
const createAuditLog = vi.fn();
const trackServerAnalyticsEvent = vi.fn();
const requireScopedContract = vi.fn();
const assertCanUseShippedAction = vi.fn();
const OrganizationAuthorizationError = class OrganizationAuthorizationError extends Error {};
const ActiveOrganizationRequiredError = class ActiveOrganizationRequiredError extends Error {};
const ActiveOrganizationScopeError = class ActiveOrganizationScopeError extends Error {
  constructor(..._args: unknown[]) {
    super("Cross-org access denied.");
  }
};

vi.mock("@/lib/auth", () => ({
  getActiveOrganizationContextOrNull: getOrganizationContextOrNull,
  assertCanUseShippedAction,
  OrganizationAuthorizationError,
  ActiveOrganizationRequiredError,
  ActiveOrganizationScopeError
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContractCalendarEvents,
  requireScopedContract
}));

vi.mock("@/lib/contracts/ics", () => ({
  buildCalendar
}));

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/analytics/events", () => ({
  trackServerAnalyticsEvent
}));

describe("ICS export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });
    requireScopedContract.mockResolvedValue({ id: "c1" });
    getContractCalendarEvents.mockResolvedValue([
      {
        uid: "rem-1",
        start: "2099-01-01T00:00:00.000Z",
        summary: "Contract renewal",
        description: "Reminder"
      }
    ]);
    buildCalendar.mockReturnValue("BEGIN:VCALENDAR");
    assertCanUseShippedAction.mockImplementation(
      async (
        context: { role: string; organizationId: string } | null,
        _action: string,
        object?: { assertScoped?: (organizationId: string) => Promise<void> }
      ) => {
        if (!context) {
          throw new ActiveOrganizationRequiredError();
        }
        if (!["owner", "admin", "operator", "reviewer"].includes(context.role)) {
          throw new OrganizationAuthorizationError();
        }
        await object?.assertScoped?.(context.organizationId);
        return context;
      }
    );
  });

  it("blocks unauthenticated requests", async () => {
    getOrganizationContextOrNull.mockResolvedValueOnce(null);
    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "c1" } });

    expect(response.status).toBe(401);
  });

  it("returns calendar data and logs audit", async () => {
    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "c1" } });

    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(getContractCalendarEvents).toHaveBeenCalledWith("c1", "org-1");
    expect(buildCalendar).toHaveBeenCalled();
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.ics_exported",
        contractId: "c1"
      })
    );
  });

  it("treats ICS as a baseline export path for reviewer roles", async () => {
    getOrganizationContextOrNull.mockResolvedValueOnce({
      user: { id: "user-2" },
      organizationId: "org-1",
      role: "reviewer"
    });

    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "c1" } });

    expect(response.status).toBe(200);
    expect(buildCalendar).toHaveBeenCalledTimes(1);
  });

  it("does not leak contract calendar data from an inactive organization", async () => {
    requireScopedContract.mockRejectedValueOnce(
      new ActiveOrganizationScopeError("export_ics", "org-1", "org-foreign")
    );

    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), { params: { id: "foreign-contract" } });

    expect(response.status).toBe(404);
    expect(buildCalendar).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
