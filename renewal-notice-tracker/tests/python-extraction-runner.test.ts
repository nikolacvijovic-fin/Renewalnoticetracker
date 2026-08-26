import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminScopedContractFile: vi.fn(),
  replaceAdminContractDocumentPages: vi.fn(),
  updateAdminContractExtractionRun: vi.fn(),
  requestContractExtraction: vi.fn(),
  recordContractExtractionResult: vi.fn(),
  failContractExtractionRun: vi.fn(),
  parseContractDocument: vi.fn(),
  applySelectiveOcrFallback: vi.fn(),
  extractFullCommercialDocument: vi.fn()
}));

vi.mock("@/lib/contract-intelligence/repositories/admin-extraction-repository", () => ({
  getAdminScopedContractFile: mocks.getAdminScopedContractFile,
  replaceAdminContractDocumentPages: mocks.replaceAdminContractDocumentPages,
  updateAdminContractExtractionRun: mocks.updateAdminContractExtractionRun
}));
vi.mock("@/lib/contract-intelligence/extraction-runs", () => ({
  requestContractExtraction: mocks.requestContractExtraction,
  recordContractExtractionResult: mocks.recordContractExtractionResult,
  failContractExtractionRun: mocks.failContractExtractionRun
}));
vi.mock("@/lib/contract-intelligence/document-parser", () => ({
  parseContractDocument: mocks.parseContractDocument,
  applySelectiveOcrFallback: mocks.applySelectiveOcrFallback
}));
vi.mock("@/lib/contract-intelligence/full-document-extractor", () => ({
  extractFullCommercialDocument: mocks.extractFullCommercialDocument
}));
vi.mock("@/lib/contract-intelligence/openai-commercial-extractor", () => ({
  OpenAiCommercialExtractionProvider: class {
    providerName = "openai";
    modelName = "test-model";
  }
}));

const page = {
  pageNumber: 1,
  text: "The subscription renews automatically.",
  textHash: "hash",
  extractionMethod: "native_pdf",
  ocrConfidence: null,
  blocks: [],
  warningCodes: []
};

describe("full-document contract extraction runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminScopedContractFile.mockResolvedValue({
      data: {
        id: "file-1",
        fileName: "agreement.pdf",
        mimeType: "application/pdf",
        declaredSizeBytes: 12,
        bytes: Buffer.from("%PDF-synthetic")
      },
      error: null
    });
    mocks.requestContractExtraction.mockResolvedValue({
      id: "run-1",
      status: "queued",
      attempt_count: 0,
      processing_lease_expires_at: null
    });
    mocks.parseContractDocument.mockResolvedValue({
      fileId: "file-1",
      mimeType: "application/pdf",
      sizeBytes: 12,
      pages: [page],
      warnings: []
    });
    mocks.replaceAdminContractDocumentPages.mockResolvedValue({ data: [{ id: "page-1", page_number: 1 }], error: null });
    mocks.extractFullCommercialDocument.mockResolvedValue({
      fields: [{
        fieldKey: "auto_renewal",
        category: "term_and_renewal",
        rawValue: true,
        normalizedValue: true,
        confidence: 0.9,
        citation: {
          sourceFileId: "file-1",
          pageNumber: 1,
          sectionLabel: null,
          clauseLabel: null,
          snippet: "renews automatically",
          startOffset: 17,
          endOffset: 37,
          extractionMethod: "native_pdf",
          ocrConfidence: null
        },
        warningCodes: [],
        provider: "openai",
        model: "test-model",
        promptVersion: "v2",
        schemaVersion: "v2"
      }],
      warnings: [],
      status: "completed",
      processedPageCount: 1,
      inputCharacterCount: 39,
      inputTokenCount: 10,
      outputTokenCount: 4,
      model: "test-model"
    });
    mocks.recordContractExtractionResult.mockResolvedValue({
      run: { id: "run-1", status: "completed" },
      fields: [{ id: "field-1" }],
      computedEvidenceConfidence: 0.9
    });
  });

  it("retrieves real scoped bytes, persists pages, and records provider-backed evidence", async () => {
    const { runFullDocumentContractExtraction } = await import("@/lib/contract-intelligence/python-extraction-runner");
    const result = await runFullDocumentContractExtraction({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1",
      requestedByUserId: "user-1"
    });
    expect(result.ok).toBe(true);
    expect(mocks.getAdminScopedContractFile).toHaveBeenCalledWith({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1"
    });
    expect(mocks.parseContractDocument.mock.calls[0]?.[0].buffer).toEqual(Buffer.from("%PDF-synthetic"));
    expect(mocks.replaceAdminContractDocumentPages).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1"
    }));
    expect(mocks.recordContractExtractionResult).toHaveBeenCalledWith(expect.objectContaining({
      result: expect.objectContaining({ extractionMode: "provider_backed", pageCount: 1 })
    }));
  });

  it("denies cross-organization file resolution before provider execution", async () => {
    mocks.getAdminScopedContractFile.mockResolvedValue({ data: null, error: new Error("Scoped contract file was not found.") });
    const { runFullDocumentContractExtraction } = await import("@/lib/contract-intelligence/python-extraction-runner");
    await expect(runFullDocumentContractExtraction({
      organizationId: "foreign-org",
      contractId: "contract-1",
      contractFileId: "file-1"
    })).rejects.toThrow("Scoped contract file was not found");
    expect(mocks.parseContractDocument).not.toHaveBeenCalled();
    expect(mocks.extractFullCommercialDocument).not.toHaveBeenCalled();
  });

  it("returns an idempotent replay for an already completed schema/model run", async () => {
    mocks.requestContractExtraction.mockResolvedValue({ id: "run-1", status: "completed" });
    const { runFullDocumentContractExtraction } = await import("@/lib/contract-intelligence/python-extraction-runner");
    const result = await runFullDocumentContractExtraction({ organizationId: "org-1", contractId: "contract-1" });
    expect(result).toMatchObject({ ok: true, idempotentReplay: true });
    expect(mocks.parseContractDocument).not.toHaveBeenCalled();
  });

  it("records only a safe failure when parsing fails", async () => {
    mocks.parseContractDocument.mockRejectedValue(Object.assign(new Error("raw provider payload secret"), { code: "corrupt_document" }));
    const { runFullDocumentContractExtraction } = await import("@/lib/contract-intelligence/python-extraction-runner");
    const result = await runFullDocumentContractExtraction({ organizationId: "org-1", contractId: "contract-1" });
    expect(result).toMatchObject({ ok: false, errorCode: "corrupt_document" });
    expect(mocks.failContractExtractionRun).toHaveBeenCalledWith(expect.objectContaining({
      safeErrorMessage: "Contract extraction failed (corrupt_document)."
    }));
    expect(JSON.stringify(mocks.failContractExtractionRun.mock.calls)).not.toContain("raw provider payload secret");
  });
});
