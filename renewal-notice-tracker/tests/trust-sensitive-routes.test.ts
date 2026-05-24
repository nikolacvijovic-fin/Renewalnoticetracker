import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const createAuditLog = vi.fn();
const extractContractMetadata = vi.fn();
const generateReminderRecommendations = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    getOrganizationContextOrNull,
    getActiveOrganizationContextOrNull: getOrganizationContextOrNull
  };
});

vi.mock("@/lib/audit", () => ({
  createAuditLog
}));

vi.mock("@/lib/ai/extract-contract", () => ({
  extractContractMetadata
}));

vi.mock("@/lib/contracts/reminders", () => ({
  generateReminderRecommendations
}));

describe("trust-sensitive route authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "reviewer"
    });
    extractContractMetadata.mockResolvedValue({ notice_deadline: "2030-01-01" });
    generateReminderRecommendations.mockReturnValue([{ reminder_type: "notice_deadline" }]);
  });

  it("rejects anonymous extract preview access", async () => {
    getOrganizationContextOrNull.mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/extract/route");
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ documentText: "Notice clause" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(401);
    expect(extractContractMetadata).not.toHaveBeenCalled();
  });

  it("returns safe validation errors for malformed extract requests", async () => {
    const { POST } = await import("@/app/api/extract/route");
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ documentText: "" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("records an org-scoped extraction preview audit event", async () => {
    const { POST } = await import("@/app/api/extract/route");
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ documentText: "Notice clause" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        action: "contracts.extraction_preview_requested"
      })
    );
  });

  it("fails extraction preview explicitly when the success audit write fails", async () => {
    createAuditLog.mockRejectedValueOnce(new Error("audit failed"));
    const { POST } = await import("@/app/api/extract/route");
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ documentText: "Notice clause" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Extraction failed." });
  });

  it("rejects owner access to extraction preview because it is a review-lane action", async () => {
    getOrganizationContextOrNull.mockResolvedValueOnce({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "owner"
    });

    const { POST } = await import("@/app/api/extract/route");
    const response = await POST(
      new Request("http://localhost/api/extract", {
        method: "POST",
        body: JSON.stringify({ documentText: "Notice clause" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(403);
    expect(extractContractMetadata).not.toHaveBeenCalled();
  });

  it(
    "rejects anonymous reminder preview access",
    async () => {
      getOrganizationContextOrNull.mockResolvedValueOnce(null);
      const { POST } = await import("@/app/api/reminders/route");
      const response = await POST(
        new Request("http://localhost/api/reminders", {
          method: "POST",
          body: JSON.stringify({
            metadata: {},
            recipientEmail: "owner@example.com"
          }),
          headers: { "content-type": "application/json" }
        })
      );

      expect(response.status).toBe(401);
      expect(generateReminderRecommendations).not.toHaveBeenCalled();
    },
    15000
  );

  it("returns safe validation errors for malformed reminder preview requests", async () => {
    const { POST } = await import("@/app/api/reminders/route");
    const response = await POST(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          metadata: { bogus: true },
          recipientEmail: "owner@example.com"
        }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request." });
  });

  it("records an org-scoped reminder preview audit event", async () => {
    const { POST } = await import("@/app/api/reminders/route");
    const response = await POST(
      new Request("http://localhost/api/reminders", {
        method: "POST",
        body: JSON.stringify({
          metadata: {
            contract_title: "MSA",
            counterparty_name: "Acme",
            contract_type: null,
            effective_date: null,
            renewal_date: "2030-03-01",
            expiration_date: "2030-06-01",
            auto_renewal: true,
            renewal_term: null,
            notice_period_value: 30,
            notice_period_unit: "days",
            notice_deadline_date: "2030-01-01",
            termination_window: "30 days",
            governing_law: null,
            payment_terms: null,
            extracted_clauses: [],
            field_confidence: {},
            field_source_snippets: {},
            reminder_recommendations: [],
            reviewer_notes: null
          },
          recipientEmail: "owner@example.com"
        }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(200);
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        action: "reminders.preview_requested"
      })
    );
  });

  it("fails reminder preview explicitly when the success audit write fails", async () => {
    createAuditLog.mockRejectedValueOnce(new Error("audit failed"));
    const { POST } = await import("@/app/api/reminders/route");
    await expect(
      POST(
        new Request("http://localhost/api/reminders", {
          method: "POST",
          body: JSON.stringify({
            metadata: {
              contract_title: "MSA",
              counterparty_name: "Acme",
              contract_type: null,
              effective_date: null,
              renewal_date: "2030-03-01",
              expiration_date: "2030-06-01",
              auto_renewal: true,
              renewal_term: null,
              notice_period_value: 30,
              notice_period_unit: "days",
              notice_deadline_date: "2030-01-01",
              termination_window: "30 days",
              governing_law: null,
              payment_terms: null,
              extracted_clauses: [],
              field_confidence: {},
              field_source_snippets: {},
              reminder_recommendations: [],
              reviewer_notes: null
            },
            recipientEmail: "owner@example.com"
          }),
          headers: { "content-type": "application/json" }
        })
      )
    ).rejects.toThrow("audit failed");
  });
});
