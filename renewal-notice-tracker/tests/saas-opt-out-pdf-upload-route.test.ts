import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationContextOrNull: vi.fn(),
  assertCanUseShippedAction: vi.fn(),
  uploadSaasOptOutClockPdfAction: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getOrganizationContextOrNull: mocks.getOrganizationContextOrNull,
  assertCanUseShippedAction: mocks.assertCanUseShippedAction
}));

vi.mock("@/lib/actions/contracts/upload", () => ({
  uploadSaasOptOutClockPdfAction: mocks.uploadSaasOptOutClockPdfAction
}));

import { POST } from "@/app/api/contracts/pdf-upload/route";

function requestWithPdf(extra: Record<string, string> = {}) {
  const formData = new FormData();
  formData.set("file", new File(["%PDF-1.7"], "contract.pdf", { type: "application/pdf" }));
  for (const [key, value] of Object.entries(extra)) formData.set(key, value);
  return {
    formData: vi.fn().mockResolvedValue(formData)
  } as unknown as Request;
}

describe("PDF upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationContextOrNull.mockResolvedValue({
      organizationId: "org-1",
      role: "operator",
      user: { id: "user-1" }
    });
    mocks.assertCanUseShippedAction.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests before parsing or processing files", async () => {
    mocks.getOrganizationContextOrNull.mockResolvedValue(null);

    const response = await POST(requestWithPdf());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "authentication_required"
    });
    expect(mocks.uploadSaasOptOutClockPdfAction).not.toHaveBeenCalled();
  });

  it("rejects roles without upload permission", async () => {
    mocks.assertCanUseShippedAction.mockRejectedValue(new Error("forbidden"));

    const response = await POST(requestWithPdf());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "permission_denied"
    });
    expect(mocks.uploadSaasOptOutClockPdfAction).not.toHaveBeenCalled();
  });

  it("returns only the scoped action result and does not trust caller organization fields", async () => {
    mocks.uploadSaasOptOutClockPdfAction.mockResolvedValue({
      ok: true,
      contractId: "contract-1",
      contractFileId: "file-1",
      contractPath: "/dashboard/contracts/contract-1",
      extractionStatus: "needs_review",
      needsReview: true,
      reviewReasons: ["manual_review_required"],
      safeMessage: "The PDF was extracted and is ready for human review."
    });

    const response = await POST(requestWithPdf({ organization_id: "foreign-org" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      contractId: "contract-1",
      needsReview: true
    });
    expect(mocks.assertCanUseShippedAction).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-1" }),
      "upload_import"
    );
    expect(mocks.uploadSaasOptOutClockPdfAction).toHaveBeenCalledTimes(1);
  });

  it("keeps customer-facing failures sanitized", async () => {
    mocks.uploadSaasOptOutClockPdfAction.mockResolvedValue({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The PDF could not be processed safely. Retry the upload or add the contract manually."
    });

    const response = await POST(requestWithPdf());
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(400);
    expect(body).not.toMatch(/storage|service.role|provider payload|contract text|token|secret/i);
  });
});
