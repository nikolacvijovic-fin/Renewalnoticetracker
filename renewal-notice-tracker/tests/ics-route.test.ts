import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getContractCalendarEvents = vi.fn();
const getRenewalCommandCenterContracts = vi.fn();
const buildUrgentRenewalDashboard = vi.fn();
const buildUrgentRenewalCalendarEvents = vi.fn();
const buildTrustedUpcomingContractCalendarEvents = vi.fn();
const getSaasOptOutClock = vi.fn();
const buildSaasOptOutCalendarEvents = vi.fn();
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
  buildCalendar,
  buildUrgentRenewalCalendarEvents,
  buildTrustedUpcomingContractCalendarEvents,
  buildSaasOptOutCalendarEvents
}));

vi.mock("@/lib/dashboard/renewal-command-center", () => ({
  getRenewalCommandCenterContracts
}));

vi.mock("@/lib/dashboard/urgent-renewal-items", () => ({
  buildUrgentRenewalDashboard
}));

vi.mock("@/lib/saas/queries", () => ({
  getSaasOptOutClock
}));

vi.mock("@/lib/config", () => ({
  getAppConfig: () => ({ public: { appUrl: "https://app.noticecontrol.example" } })
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
    getRenewalCommandCenterContracts.mockResolvedValue([{ id: "c1" }]);
    buildUrgentRenewalDashboard.mockReturnValue({
      allActionItems: [{ contractId: "c1", trustStatus: "trusted" }]
    });
    buildUrgentRenewalCalendarEvents.mockReturnValue([
      {
        uid: "urgent-1",
        startDate: "2099-01-01",
        summary: "Notice deadline: Contract",
        description: "Open in NoticeControl"
      }
    ]);
    buildTrustedUpcomingContractCalendarEvents.mockReturnValue([
      {
        uid: "trusted-1",
        startDate: "2099-02-01",
        summary: "Notice deadline: Trusted Contract",
        description: "Open in NoticeControl"
      }
    ]);
    getSaasOptOutClock.mockResolvedValue({
      items: [{ software: { id: "s1", name: "SaaS" }, effectiveOptOutDeadline: "2099-01-01" }]
    });
    buildSaasOptOutCalendarEvents.mockReturnValue([
      {
        uid: "saas-1",
        startDate: "2099-01-01",
        summary: "Opt-out deadline: SaaS",
        description: "Open in NoticeControl"
      }
    ]);
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
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" })
    });

    expect(response.status).toBe(401);
  });

  it("returns calendar data and logs audit", async () => {
    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" })
    });

    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("content-disposition")).toContain("noticecontrol-contract-c1.ics");
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
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "c1" })
    });

    expect(response.status).toBe(200);
    expect(buildCalendar).toHaveBeenCalledTimes(1);
  });

  it("does not leak contract calendar data from an inactive organization", async () => {
    requireScopedContract.mockRejectedValueOnce(
      new ActiveOrganizationScopeError("export_ics", "org-1", "org-foreign")
    );

    const { GET } = await import("@/app/dashboard/contracts/[id]/ics/route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "foreign-contract" })
    });

    expect(response.status).toBe(404);
    expect(buildCalendar).not.toHaveBeenCalled();
    expect(createAuditLog).not.toHaveBeenCalled();
  });

  it("exports urgent trusted deadlines with the expected filename", async () => {
    const { GET } = await import("@/app/dashboard/contracts/urgent-deadlines/ics/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("content-disposition")).toContain("noticecontrol-urgent-deadlines.ics");
    expect(getRenewalCommandCenterContracts).toHaveBeenCalledWith("org-1");
    expect(buildUrgentRenewalCalendarEvents).toHaveBeenCalledWith({
      items: [{ contractId: "c1", trustStatus: "trusted" }],
      appUrl: "https://app.noticecontrol.example"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.ics_exported",
        details: expect.objectContaining({ export_classification: "urgent_deadline_ics" })
      })
    );
  });

  it("exports all trusted upcoming notice deadlines with the expected filename", async () => {
    const { GET } = await import("@/app/dashboard/contracts/trusted-upcoming/ics/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("content-disposition")).toContain("noticecontrol-trusted-upcoming-deadlines.ics");
    expect(getRenewalCommandCenterContracts).toHaveBeenCalledWith("org-1");
    expect(buildTrustedUpcomingContractCalendarEvents).toHaveBeenCalledWith({
      contracts: [{ id: "c1" }],
      appUrl: "https://app.noticecontrol.example"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.ics_exported",
        details: expect.objectContaining({ export_classification: "trusted_upcoming_ics" })
      })
    );
  });

  it("exports SaaS opt-out deadlines with the expected filename", async () => {
    const { GET } = await import("@/app/dashboard/saas-opt-out-clock/ics/route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    expect(response.headers.get("content-disposition")).toContain("noticecontrol-saas-opt-out-deadlines.ics");
    expect(getSaasOptOutClock).toHaveBeenCalledWith("org-1");
    expect(buildSaasOptOutCalendarEvents).toHaveBeenCalledWith({
      items: [{ software: { id: "s1", name: "SaaS" }, effectiveOptOutDeadline: "2099-01-01" }],
      appUrl: "https://app.noticecontrol.example"
    });
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contract.ics_exported",
        details: expect.objectContaining({ export_classification: "saas_opt_out_ics" })
      })
    );
  });
});
