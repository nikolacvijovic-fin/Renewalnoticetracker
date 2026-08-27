import { describe, expect, it, vi } from "vitest";

import { prepareCommercialProposalDocument } from "@/lib/quote-comparison/proposal-document-preparation";
import type { ParsedContractDocument } from "@/lib/contract-intelligence/document-parser";

function documentWithPages(pages: Array<{ text: string; warnings?: string[] }>): ParsedContractDocument {
  return {
    fileId: "proposal-file-1",
    mimeType: "application/pdf",
    sizeBytes: 100,
    pages: pages.map((page, index) => ({
      pageNumber: index + 1,
      text: page.text,
      textHash: `hash-${index + 1}`,
      extractionMethod: "native_pdf",
      ocrConfidence: null,
      blocks: [],
      warningCodes: page.warnings ?? []
    })),
    warnings: pages.flatMap((page) => page.warnings ?? [])
  };
}

const input = {
  fileId: "proposal-file-1",
  fileName: "renewal-proposal.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("pdf"),
  ocrProvider: {
    name: "test",
    performOcr: vi.fn().mockResolvedValue({
      status: "failed" as const,
      provider: "test",
      processingMode: "sync" as const,
      error: "not_used_by_injected_fallback",
      averageConfidence: null,
      estimatedCost: null
    })
  }
};

describe("commercial proposal selective OCR preparation", () => {
  it("keeps a native-text PDF on the native path", async () => {
    const native = documentWithPages([{ text: "Readable commercial proposal text" }]);
    const applyOcrFallback = vi.fn();
    const result = await prepareCommercialProposalDocument({
      ...input,
      parseDocument: vi.fn().mockResolvedValue(native),
      applyOcrFallback
    });
    expect(result).toMatchObject({ ocrAttempted: false, requiresReview: false, document: native });
    expect(applyOcrFallback).not.toHaveBeenCalled();
  });

  it("routes only weak pages in a mixed PDF through the established OCR fallback", async () => {
    const mixed = documentWithPages([
      { text: "Readable native page" },
      { text: "", warnings: ["native_page_text_insufficient"] }
    ]);
    const prepared = {
      ...mixed,
      pages: [mixed.pages[0], {
        ...mixed.pages[1]!, text: "OCR commercial terms", extractionMethod: "ocr" as const,
        ocrConfidence: 0.92, warningCodes: []
      }],
      warnings: []
    };
    const applyOcrFallback = vi.fn().mockResolvedValue(prepared);
    const result = await prepareCommercialProposalDocument({
      ...input,
      parseDocument: vi.fn().mockResolvedValue(mixed),
      applyOcrFallback
    });
    expect(applyOcrFallback).toHaveBeenCalledOnce();
    expect(result.document.pages.map((page) => page.extractionMethod)).toEqual(["native_pdf", "ocr"]);
    expect(result.requiresReview).toBe(false);
  });

  it("routes an image-only PDF through OCR", async () => {
    const imageOnly = documentWithPages([{ text: "", warnings: ["native_page_text_insufficient"] }]);
    const prepared = {
      ...imageOnly,
      pages: [{ ...imageOnly.pages[0]!, text: "OCR-only quote", extractionMethod: "ocr" as const, ocrConfidence: 0.9, warningCodes: [] }],
      warnings: []
    };
    const applyOcrFallback = vi.fn().mockResolvedValue(prepared);
    const result = await prepareCommercialProposalDocument({
      ...input,
      parseDocument: vi.fn().mockResolvedValue(imageOnly),
      applyOcrFallback
    });
    expect(result.ocrAttempted).toBe(true);
    expect(result.document.pages[0]).toMatchObject({ extractionMethod: "ocr", text: "OCR-only quote" });
  });

  it("turns OCR provider failure into review-required evidence rather than trusted output", async () => {
    const imageOnly = documentWithPages([{ text: "", warnings: ["native_page_text_insufficient"] }]);
    const result = await prepareCommercialProposalDocument({
      ...input,
      parseDocument: vi.fn().mockResolvedValue(imageOnly),
      applyOcrFallback: vi.fn().mockRejectedValue(new Error("RAW_PROVIDER_PAYLOAD"))
    });
    expect(result).toMatchObject({ ocrAttempted: true, requiresReview: true });
    expect(result.document.warnings).toContain("ocr_provider_unavailable");
    expect(JSON.stringify(result)).not.toContain("RAW_PROVIDER_PAYLOAD");
  });

  it("keeps low-confidence OCR explicitly review-required with page provenance", async () => {
    const imageOnly = documentWithPages([{ text: "", warnings: ["native_page_text_insufficient"] }]);
    const prepared = {
      ...imageOnly,
      pages: [{ ...imageOnly.pages[0]!, text: "Low confidence amount", extractionMethod: "ocr" as const,
        ocrConfidence: 0.62, warningCodes: ["ocr_low_confidence"] }],
      warnings: ["ocr_low_confidence"]
    };
    const result = await prepareCommercialProposalDocument({
      ...input,
      parseDocument: vi.fn().mockResolvedValue(imageOnly),
      applyOcrFallback: vi.fn().mockResolvedValue(prepared)
    });
    expect(result.requiresReview).toBe(true);
    expect(result.document.pages[0]).toMatchObject({ pageNumber: 1, ocrConfidence: 0.62 });
  });
});
