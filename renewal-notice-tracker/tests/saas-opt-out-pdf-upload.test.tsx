import fs from "node:fs";
import path from "node:path";
import { File as NodeFile } from "node:buffer";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfUploadWorkbench } from "@/components/saas/pdf-upload-workbench";
import {
  MAX_CONTRACT_PDF_BYTES,
  contractTitleFromPdfFileName,
  hasContractPdfSignature,
  sanitizeContractPdfFileName,
  validateContractPdf,
  type PdfContractUploadActionResult
} from "@/lib/contracts/pdf-upload";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh })
}));

type PendingRequest = {
  request: FakeXmlHttpRequest;
  formData: FormData;
};

class FakeXmlHttpRequest extends EventTarget {
  static pending: PendingRequest[] = [];
  readonly upload = new EventTarget();
  responseText = "";
  responseType = "";
  withCredentials = false;
  timeout = 0;

  open() {}
  setRequestHeader() {}
  send(formData: FormData) {
    FakeXmlHttpRequest.pending.push({ request: this, formData });
  }
}

function pdf(name: string, content = "%PDF-1.7 contract") {
  return new File([content], name, { type: "application/pdf" });
}

async function respondToNext(result: PdfContractUploadActionResult) {
  const pending = FakeXmlHttpRequest.pending.shift();
  if (!pending) throw new Error("Expected a pending PDF upload request.");
  await act(async () => {
    pending.request.upload.dispatchEvent(new ProgressEvent("progress", {
      lengthComputable: true,
      loaded: pending.formData.get("file") instanceof File
        ? (pending.formData.get("file") as File).size
        : 1,
      total: pending.formData.get("file") instanceof File
        ? (pending.formData.get("file") as File).size
        : 1
    }));
    pending.request.upload.dispatchEvent(new Event("load"));
    pending.request.responseText = JSON.stringify(result);
    pending.request.dispatchEvent(new Event("load"));
  });
}

describe("SaaS Opt-Out Clock PDF upload", () => {
  beforeEach(() => {
    FakeXmlHttpRequest.pending = [];
    refresh.mockReset();
    vi.stubGlobal("XMLHttpRequest", FakeXmlHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts PDFs and rejects unsupported, empty, and oversized files", () => {
    expect(validateContractPdf(pdf("renewal.pdf"))).toEqual({ ok: true });
    expect(validateContractPdf(new File(["image"], "scan.png", { type: "image/png" }))).toMatchObject({
      ok: false,
      code: "invalid_file_type"
    });
    expect(validateContractPdf(new File([], "empty.pdf", { type: "application/pdf" }))).toMatchObject({
      ok: false,
      code: "empty_file"
    });
    expect(validateContractPdf({
      name: "large.pdf",
      type: "application/pdf",
      size: MAX_CONTRACT_PDF_BYTES + 1
    })).toMatchObject({ ok: false, code: "file_too_large" });
  });

  it("rejects a renamed payload that does not have a PDF signature", async () => {
    await expect(hasContractPdfSignature(new NodeFile(["%PDF-1.7 contract"], "contract.pdf", {
      type: "application/pdf"
    }))).resolves.toBe(true);
    await expect(hasContractPdfSignature(new NodeFile(["not a PDF"], "spoofed.pdf", {
      type: "application/pdf"
    }))).resolves.toBe(false);
  });

  it("normalizes filenames and derives a safe working title", () => {
    expect(sanitizeContractPdfFileName("../../Acme:<Renewal>? 2027.PDF"))
      .toBe("Acme--Renewal-- 2027.pdf");
    expect(contractTitleFromPdfFileName("acme_cloud-renewal.pdf"))
      .toBe("acme cloud renewal");
  });

  it("supports multiple selection, removal, sequential progress, partial failure, and retry", async () => {
    const { container } = render(
      <PdfUploadWorkbench
        members={[{ userId: "user-1", label: "Alex Owner" }]}
        defaultOwnerUserId="user-1"
        canUpload
        capacityMessage="Capacity available."
      />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = pdf("first.pdf");
    const second = pdf("second.pdf");
    const third = pdf("third.pdf");
    const removable = pdf("remove-me.pdf");

    fireEvent.change(input, { target: { files: [first, second, third, removable] } });
    expect(screen.getByText("4 PDFs selected.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove remove-me.pdf" }));
    expect(screen.queryByText("remove-me.pdf")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Upload 3 PDFs" }));
    await waitFor(() => {
      expect(screen.getByText(/Uploading/)).toBeInTheDocument();
      expect(FakeXmlHttpRequest.pending).toHaveLength(1);
    });

    await act(async () => {
      FakeXmlHttpRequest.pending[0]?.request.upload.dispatchEvent(new Event("load"));
    });
    expect(screen.getByText(/Extracting renewal fields/)).toBeInTheDocument();

    await respondToNext({
      ok: true,
      contractId: "contract-1",
      contractFileId: "file-1",
      contractPath: "/dashboard/contracts/contract-1",
      extractionStatus: "needs_review",
      needsReview: true,
      reviewReasons: ["manual_review_required"],
      safeMessage: "The PDF was extracted and is ready for human review."
    });
    await waitFor(() => expect(FakeXmlHttpRequest.pending).toHaveLength(1));

    await respondToNext({
      ok: true,
      contractId: "contract-2",
      contractFileId: "file-2",
      contractPath: "/dashboard/contracts/contract-2",
      extractionStatus: "extraction_failed",
      needsReview: true,
      reviewReasons: ["ocr_low_confidence"],
      safeMessage: "The PDF was uploaded, but extraction needs attention."
    });
    await waitFor(() => expect(FakeXmlHttpRequest.pending).toHaveLength(1));

    await respondToNext({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The PDF could not be processed safely."
    });
    await waitFor(() => {
      expect(screen.getByText("1 ready for review, 1 need extraction attention, 1 failed.")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("link", { name: "Review contract" })).toHaveLength(2);
    expect(refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry third.pdf" }));
    await waitFor(() => expect(FakeXmlHttpRequest.pending).toHaveLength(1));
    await respondToNext({
      ok: true,
      contractId: "contract-3",
      contractFileId: "file-3",
      contractPath: "/dashboard/contracts/contract-3",
      extractionStatus: "needs_review",
      needsReview: true,
      reviewReasons: [],
      safeMessage: "The PDF was extracted and is ready for human review."
    });
    await waitFor(() => {
      expect(screen.getByText("2 ready for review, 1 need extraction attention, 0 failed.")).toBeInTheDocument();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("keeps a complete batch failure visible and retryable", async () => {
    const { container } = render(
      <PdfUploadWorkbench
        members={[]}
        defaultOwnerUserId=""
        canUpload
        capacityMessage="Capacity available."
      />
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf("failed-one.pdf"), pdf("failed-two.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "Upload 2 PDFs" }));
    await waitFor(() => expect(FakeXmlHttpRequest.pending).toHaveLength(1));

    await respondToNext({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The PDF could not be processed safely."
    });
    await waitFor(() => expect(FakeXmlHttpRequest.pending).toHaveLength(1));
    await respondToNext({
      ok: false,
      errorCode: "upload_failed",
      safeMessage: "The PDF could not be processed safely."
    });

    await waitFor(() => {
      expect(screen.getByText("0 ready for review, 0 need extraction attention, 2 failed.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Retry failed-one.pdf" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Retry failed-two.pdf" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("keeps the upload boundary organization-scoped and review-gated", () => {
    const action = fs.readFileSync(
      path.join(process.cwd(), "lib/actions/contracts/legacy.ts"),
      "utf8"
    );
    const route = fs.readFileSync(
      path.join(process.cwd(), "app/api/contracts/pdf-upload/route.ts"),
      "utf8"
    );

    expect(route).toContain("getOrganizationContextOrNull");
    expect(route).toContain("assertCanUseShippedAction(context, \"upload_import\")");
    expect(action).toContain("requireShippedRuntimeAction(\"upload_import\")");
    expect(action).toContain("Assigned owner must be a member of the active organization.");
    expect(action).toContain("needsReview: true");
    expect(action).not.toContain("normalizedFormData.set(\"organization_id\"");
  });
});
