import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationContextOrNull: vi.fn(),
  assertCanUseShippedAction: vi.fn(),
  uploadSaasOptOutClockPdfAction: vi.fn(),
  retrySaasOptOutClockPdfExtractionAction: vi.fn(),
  getScopedPdfUploadAttemptResult: vi.fn(),
  abandonScopedPdfUploadAttempt: vi.fn()
}));

vi.mock("@/lib/auth", () => ({
  getOrganizationContextOrNull: mocks.getOrganizationContextOrNull,
  assertCanUseShippedAction: mocks.assertCanUseShippedAction
}));

vi.mock("@/lib/actions/contracts/upload", () => ({
  uploadSaasOptOutClockPdfAction: mocks.uploadSaasOptOutClockPdfAction,
  retrySaasOptOutClockPdfExtractionAction: mocks.retrySaasOptOutClockPdfExtractionAction
}));

vi.mock("@/lib/contracts/pdf-upload-attempts", () => ({
  getScopedPdfUploadAttemptResult: mocks.getScopedPdfUploadAttemptResult,
  abandonScopedPdfUploadAttempt: mocks.abandonScopedPdfUploadAttempt
}));

import { GET, PATCH, POST } from "@/app/api/contracts/pdf-upload/route";

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
    mocks.getScopedPdfUploadAttemptResult.mockResolvedValue(null);
  });

  it("recovers status only inside the active organization", async () => {
    mocks.getScopedPdfUploadAttemptResult.mockResolvedValue({
      ok: true,
      contractId: "contract-1",
      contractFileId: "file-1",
      contractPath: "/dashboard/contracts/contract-1",
      extractionStatus: "needs_review",
      needsReview: true,
      reviewReasons: [],
      recovered: true,
      safeMessage: "Recovered safely."
    });

    const response = await GET(new Request(
      "https://noticecontrol.test/api/contracts/pdf-upload?attemptId=11111111-1111-4111-8111-111111111111"
    ));

    expect(response.status).toBe(200);
    expect(mocks.getScopedPdfUploadAttemptResult).toHaveBeenCalledWith({
      organizationId: "org-1",
      uploadAttemptId: "11111111-1111-4111-8111-111111111111",
      recovered: true
    });
  });

  it("does not reveal an attempt outside the active organization", async () => {
    const response = await GET(new Request(
      "https://noticecontrol.test/api/contracts/pdf-upload?attemptId=11111111-1111-4111-8111-111111111111"
    ));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
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

  it("rejects an owner even when the general intake gate has already allowed the request", async () => {
    mocks.getOrganizationContextOrNull.mockResolvedValue({
      organizationId: "org-1",
      role: "owner",
      user: { id: "user-1" }
    });

    const response = await POST(requestWithPdf());

    expect(response.status).toBe(403);
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

  it("retries terminal extraction against the scoped persisted attempt", async () => {
    mocks.retrySaasOptOutClockPdfExtractionAction.mockResolvedValue({
      ok: true,
      contractId: "contract-1",
      contractFileId: "file-1",
      contractPath: "/dashboard/contracts/contract-1",
      extractionStatus: "processing",
      needsReview: true,
      reviewReasons: [],
      uploadAttemptId: "11111111-1111-4111-8111-111111111111",
      jobId: "job-1",
      recovered: true,
      safeMessage: "Extraction retry is queued against the existing PDF."
    });

    const response = await PATCH(new Request(
      "https://noticecontrol.test/api/contracts/pdf-upload?attemptId=11111111-1111-4111-8111-111111111111",
      { method: "PATCH" }
    ));

    expect(response.status).toBe(202);
    expect(mocks.retrySaasOptOutClockPdfExtractionAction).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    await expect(response.json()).resolves.toMatchObject({
      contractId: "contract-1",
      contractFileId: "file-1",
      jobId: "job-1",
      recovered: true
    });
  });

  it("does not let a reviewer retry extraction", async () => {
    mocks.getOrganizationContextOrNull.mockResolvedValue({
      organizationId: "org-1",
      role: "reviewer",
      user: { id: "user-1" }
    });

    const response = await PATCH(new Request(
      "https://noticecontrol.test/api/contracts/pdf-upload?attemptId=11111111-1111-4111-8111-111111111111",
      { method: "PATCH" }
    ));

    expect(response.status).toBe(403);
    expect(mocks.retrySaasOptOutClockPdfExtractionAction).not.toHaveBeenCalled();
  });
});
