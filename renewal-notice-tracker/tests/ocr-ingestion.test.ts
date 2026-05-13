import { beforeEach, describe, expect, it, vi } from "vitest";

const getOcrProvider = vi.fn();

vi.mock("@/lib/ocr/provider", () => ({
  getOcrProvider
}));

describe("OCR ingestion fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses OCR when native extraction is empty and OCR succeeds", async () => {
    getOcrProvider.mockReturnValue({
      performOcr: vi.fn().mockResolvedValue({
        status: "completed",
        provider: "mock",
        processingMode: "sync",
        text: "Scanned renewal notice",
        averageConfidence: 0.54,
        estimatedCost: 0,
        pages: [
          {
            pageNumber: 1,
            text: "Scanned renewal notice",
            confidence: 0.54,
            lines: []
          }
        ]
      })
    });

    const { resolveDocumentTextForExtraction } = await import("@/lib/ocr/ingestion");
    const result = await resolveDocumentTextForExtraction({
      buffer: Buffer.from("scan"),
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      nativeExtraction: {
        text: "",
        error: "No extractable text found in the PDF."
      }
    });

    expect(result.source).toBe("ocr");
    expect(result.text).toContain("Scanned renewal notice");
    expect(result.ocrDetectedNeeded).toBe(true);
  });

  it("keeps the native extraction path when mixed native text is already usable", async () => {
    const { resolveDocumentTextForExtraction } = await import("@/lib/ocr/ingestion");
    const result = await resolveDocumentTextForExtraction({
      buffer: Buffer.from("native"),
      fileName: "native.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      nativeExtraction: {
        text: "Master Services Agreement Notice deadline 2030-11-30 Renewal term annual.",
        error: null
      }
    });

    expect(result.source).toBe("native_text");
    expect(getOcrProvider).not.toHaveBeenCalled();
  });
});
