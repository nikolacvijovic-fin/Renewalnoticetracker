import mammoth from "mammoth";
import pdfParse from "pdf-parse";

export type ExtractedDocumentText = {
  text: string | null;
  error: string | null;
};

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedDocumentText> {
  try {
    if (mimeType === "application/pdf") {
      const result = await pdfParse(buffer);
      const text = normalizeExtractedText(result.text);
      return {
        text,
        error: isExtractedTextEmpty(text) ? "No extractable text found in the PDF." : null
      };
    }

    if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeExtractedText(result.value);
      return {
        text,
        error: isExtractedTextEmpty(text) ? "No extractable text found in the DOCX file." : null
      };
    }

    return { text: null, error: "Unsupported file type. Upload PDF or DOCX." };
  } catch (error) {
    return {
      text: null,
      error: error instanceof Error ? error.message : "File parsing failed."
    };
  }
}

export function normalizeExtractedText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s{3,}/g, "\n\n").trim();
}

export function isExtractedTextEmpty(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}
