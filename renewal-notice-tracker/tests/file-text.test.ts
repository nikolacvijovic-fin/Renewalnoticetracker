import { beforeEach, describe, expect, it, vi } from "vitest";
import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import {
  extractTextFromFile,
  isExtractedTextEmpty,
  normalizeExtractedText
} from "@/lib/extractors/file-text";

vi.mock("mammoth", () => ({
  default: {
    extractRawText: vi.fn()
  }
}));

vi.mock("pdf-parse", () => ({
  default: vi.fn()
}));

describe("file text extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes extracted text", () => {
    expect(normalizeExtractedText("A\u0000B    C")).toBe("AB\n\nC");
    expect(isExtractedTextEmpty("   ")).toBe(true);
  });

  it("extracts PDF text with normalization", async () => {
    vi.mocked(pdfParse).mockResolvedValue({ text: "Payment    terms" } as never);

    const result = await extractTextFromFile(Buffer.from("pdf"), "application/pdf");

    expect(result).toEqual({
      text: "Payment\n\nterms",
      error: null
    });
  });

  it("flags empty DOCX extraction safely", async () => {
    vi.mocked(mammoth.extractRawText).mockResolvedValue({ value: "   " } as never);

    const result = await extractTextFromFile(
      Buffer.from("docx"),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    expect(result.text).toBe("");
    expect(result.error).toContain("No extractable text");
  });

  it("rejects unsupported file types", async () => {
    const result = await extractTextFromFile(Buffer.from("txt"), "text/plain");
    expect(result.error).toContain("Unsupported");
  });
});
