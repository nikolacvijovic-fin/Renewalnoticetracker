import { beforeEach, describe, expect, it, vi } from "vitest";

const getOrganizationContextOrNull = vi.fn();
const getContractRiskAuditContext = vi.fn();
const assertCanAccessIntelligenceSurface = vi.fn();
const auditRiskExplanationViewed = vi.fn();

class IntelligenceAuthorizationError extends Error {}
class IntelligencePlanAccessError extends Error {}

vi.mock("@/lib/auth", () => ({
  getOrganizationContextOrNull
}));

vi.mock("@/lib/contracts/kernel-queries", () => ({
  getContractRiskAuditContext
}));

vi.mock("@/lib/intelligence/access", () => ({
  assertCanAccessIntelligenceSurface,
  IntelligenceAuthorizationError,
  IntelligencePlanAccessError
}));

vi.mock("@/lib/intelligence/audit", () => ({
  auditRiskExplanationViewed
}));

describe("risk explanation view audit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrganizationContextOrNull.mockResolvedValue({
      user: { id: "user-1" },
      organizationId: "org-1",
      role: "reviewer"
    });
    getContractRiskAuditContext.mockResolvedValue({
      id: "contract-1",
      owner_user_id: "owner-1"
    });
    assertCanAccessIntelligenceSurface.mockResolvedValue({ allowed: true });
  });

  it("records a truthful explanation-view event only on explicit drawer access", async () => {
    const { POST } = await import(
      "@/app/api/intelligence/risk/contracts/[id]/explanation-view/route"
    );

    const response = await POST(
      new Request("http://localhost/api/intelligence/risk/contracts/contract-1/explanation-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSurface: "risk_queue",
          riskBand: "critical",
          confidenceLevel: "low",
          reasonCount: 2,
          warningCount: 1,
          calculationVersion: "risk_score.v1",
          inputDataVersion: "trusted_workflow_state.v1"
        })
      }),
      { params: { id: "contract-1" } }
    );

    expect(response.status).toBe(204);
    expect(assertCanAccessIntelligenceSurface).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "risk_explanation",
        contractOwnerUserId: "owner-1"
      })
    );
    expect(auditRiskExplanationViewed).toHaveBeenCalledWith({
      organizationId: "org-1",
      actorUserId: "user-1",
      contractId: "contract-1",
      sourceSurface: "risk_queue",
      riskBand: "critical",
      lowConfidenceCount: 1,
      reasonCount: 2,
      warningCount: 1,
      calculationVersion: "risk_score.v1",
      inputDataVersion: "trusted_workflow_state.v1"
    });
  });

  it("rejects passive or malformed requests without writing an audit event", async () => {
    const { POST } = await import(
      "@/app/api/intelligence/risk/contracts/[id]/explanation-view/route"
    );

    const response = await POST(
      new Request("http://localhost/api/intelligence/risk/contracts/contract-1/explanation-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSurface: "risk_queue",
          riskBand: "critical"
        })
      }),
      { params: { id: "contract-1" } }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Invalid request body.",
        code: "ERR_RISK_EXPLANATION_REQUEST_002",
        requestId: expect.any(String)
      })
    );
    expect(auditRiskExplanationViewed).not.toHaveBeenCalled();
  });

  it("keeps denial behavior unchanged for unauthorized explanation access", async () => {
    assertCanAccessIntelligenceSurface.mockRejectedValue(
      new IntelligenceAuthorizationError("forbidden")
    );

    const { POST } = await import(
      "@/app/api/intelligence/risk/contracts/[id]/explanation-view/route"
    );

    const response = await POST(
      new Request("http://localhost/api/intelligence/risk/contracts/contract-1/explanation-view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceSurface: "contract_detail",
          riskBand: "critical",
          confidenceLevel: "low",
          reasonCount: 2,
          warningCount: 1,
          calculationVersion: "risk_score.v1",
          inputDataVersion: "trusted_workflow_state.v1"
        })
      }),
      { params: { id: "contract-1" } }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        error: "Forbidden",
        code: "ERR_PERMISSION_DENIED_001",
        requestId: expect.any(String)
      })
    );
    expect(auditRiskExplanationViewed).not.toHaveBeenCalled();
  });
});
