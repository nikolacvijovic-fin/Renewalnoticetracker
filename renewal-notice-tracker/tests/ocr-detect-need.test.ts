import { describe, expect, it } from "vitest";
import { detectOcrNeed } from "@/lib/ocr/detect-ocr-need";

describe("OCR need detection", () => {
  it("routes empty native extraction into OCR fallback", () => {
    const decision = detectOcrNeed({
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extractedText: "",
      extractionError: "No extractable text found."
    });

    expect(decision.shouldUseOcr).toBe(true);
    expect(decision.confidence).toBe("high");
  });

  it("keeps mixed native-text PDFs on the native extraction path when quality looks acceptable", () => {
    const decision = detectOcrNeed({
      mimeType: "application/pdf",
      sizeBytes: 1024,
      extractedText:
        "Master Services Agreement Renewal Date 2030-12-31 Notice deadline 2030-11-30 Payment terms net 30.",
      extractionError: null
    });

    expect(decision.shouldUseOcr).toBe(false);
    expect(decision.reason).toContain("acceptable");
  });
});
