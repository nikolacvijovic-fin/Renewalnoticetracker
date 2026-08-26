import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import mammoth from "mammoth";
import type { OcrProvider } from "@/lib/ocr/types";

const require = createRequire(import.meta.url);
const { PDFDocument } = require("pdf-lib") as typeof import("pdf-lib");
const pdfParse = require("pdf-parse") as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number }>;

export const MAX_CONTRACT_FILE_BYTES = 15 * 1024 * 1024;
export const MIN_NATIVE_PAGE_CHARACTERS = 80;
export const MAX_PROVIDER_CHUNK_CHARACTERS = 12_000;
export const PROVIDER_CHUNK_OVERLAP = 400;

export type ContractDocumentBlock = {
  paragraphIndex: number;
  sectionHeading: string | null;
  text: string;
  startOffset: number;
  endOffset: number;
};

export type ContractDocumentPage = {
  pageNumber: number;
  text: string;
  textHash: string;
  extractionMethod: "native_pdf" | "docx" | "ocr";
  ocrConfidence: number | null;
  blocks: ContractDocumentBlock[];
  warningCodes: string[];
};

export type ParsedContractDocument = {
  fileId: string;
  mimeType: string;
  sizeBytes: number;
  pages: ContractDocumentPage[];
  warnings: string[];
};

export type ContractDocumentChunk = {
  chunkIndex: number;
  pageNumber: number;
  text: string;
  pageStartOffset: number;
  pageEndOffset: number;
  extractionMethod: ContractDocumentPage["extractionMethod"];
  ocrConfidence: number | null;
};

export class ContractDocumentParseError extends Error {
  constructor(
    public readonly code:
      | "unsupported_file_type"
      | "file_too_large"
      | "file_signature_mismatch"
      | "encrypted_document"
      | "corrupt_document"
      | "empty_document",
    message: string
  ) {
    super(message);
    this.name = "ContractDocumentParseError";
  }
}

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function blocksForText(text: string): ContractDocumentBlock[] {
  const blocks: ContractDocumentBlock[] = [];
  let cursor = 0;
  for (const [index, paragraph] of text.split(/\n{2,}/).entries()) {
    const normalized = normalizeText(paragraph);
    if (!normalized) continue;
    const startOffset = text.indexOf(normalized, cursor);
    const safeStart = startOffset >= 0 ? startOffset : cursor;
    const sectionHeading =
      normalized.length <= 120 && /^(?:\d+(?:\.\d+)*[.)]?\s+)?[A-Z][A-Z\s/&-]{3,}$/.test(normalized)
        ? normalized
        : null;
    blocks.push({
      paragraphIndex: index,
      sectionHeading,
      text: normalized,
      startOffset: safeStart,
      endOffset: safeStart + normalized.length
    });
    cursor = safeStart + normalized.length;
  }
  return blocks;
}

function validateFile(buffer: Buffer, mimeType: string) {
  if (buffer.length === 0) {
    throw new ContractDocumentParseError("empty_document", "The uploaded document is empty.");
  }
  if (buffer.length > MAX_CONTRACT_FILE_BYTES) {
    throw new ContractDocumentParseError("file_too_large", "The uploaded document exceeds the 15 MiB limit.");
  }
  if (mimeType === "application/pdf") {
    if (buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new ContractDocumentParseError("file_signature_mismatch", "The file content is not a valid PDF.");
    }
    return;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const signature = buffer.subarray(0, 4).toString("hex");
    if (!signature.startsWith("504b03") && !signature.startsWith("504b05")) {
      throw new ContractDocumentParseError("file_signature_mismatch", "The file content is not a valid DOCX package.");
    }
    return;
  }
  throw new ContractDocumentParseError("unsupported_file_type", "Only PDF and DOCX contracts are supported.");
}

async function parsePdf(buffer: Buffer): Promise<ContractDocumentPage[]> {
  const pages: ContractDocumentPage[] = [];
  try {
    await PDFDocument.load(buffer, { ignoreEncryption: false });
    await pdfParse(buffer, {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{ items: Array<{ str?: string; hasEOL?: boolean }> }>;
      }) => {
        const content = await pageData.getTextContent();
        const text = normalizeText(
          content.items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join("")
        );
        pages.push({
          pageNumber: pages.length + 1,
          text,
          textHash: hashText(text),
          extractionMethod: "native_pdf",
          ocrConfidence: null,
          blocks: blocksForText(text),
          warningCodes: text.length < MIN_NATIVE_PAGE_CHARACTERS ? ["native_page_text_insufficient"] : []
        });
        return text;
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF parsing failed.";
    if (/password|encrypted/i.test(message)) {
      throw new ContractDocumentParseError("encrypted_document", "Encrypted PDFs must be unlocked before upload.");
    }
    const safeError = new ContractDocumentParseError("corrupt_document", "The PDF could not be parsed safely.");
    Object.defineProperty(safeError, "cause", { value: error, enumerable: false });
    throw safeError;
  }
  if (pages.length === 0) {
    throw new ContractDocumentParseError("empty_document", "The PDF contains no readable pages.");
  }
  return pages;
}

async function parseDocx(buffer: Buffer): Promise<ContractDocumentPage[]> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeText(result.value);
    if (!text) {
      throw new ContractDocumentParseError("empty_document", "The DOCX contains no readable text.");
    }
    return [{
      pageNumber: 1,
      text,
      textHash: hashText(text),
      extractionMethod: "docx",
      ocrConfidence: null,
      blocks: blocksForText(text),
      warningCodes: result.messages.length > 0 ? ["docx_conversion_warning"] : []
    }];
  } catch (error) {
    if (error instanceof ContractDocumentParseError) throw error;
    throw new ContractDocumentParseError("corrupt_document", "The DOCX could not be parsed safely.");
  }
}

export async function parseContractDocument(input: {
  fileId: string;
  buffer: Buffer;
  mimeType: string;
  pdfPageExtractor?: (buffer: Buffer) => Promise<ContractDocumentPage[]>;
}): Promise<ParsedContractDocument> {
  validateFile(input.buffer, input.mimeType);
  const pages = input.mimeType === "application/pdf"
    ? await (input.pdfPageExtractor ?? parsePdf)(input.buffer)
    : await parseDocx(input.buffer);
  return {
    fileId: input.fileId,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    pages,
    warnings: pages.flatMap((page) => page.warningCodes)
  };
}

export async function applySelectiveOcrFallback(input: {
  document: ParsedContractDocument;
  originalPdf: Buffer;
  fileName: string;
  provider: OcrProvider;
}): Promise<ParsedContractDocument> {
  if (input.document.mimeType !== "application/pdf") return input.document;
  const weakPages = input.document.pages.filter((page) => page.text.length < MIN_NATIVE_PAGE_CHARACTERS);
  if (weakPages.length === 0) return input.document;

  let pdf: import("pdf-lib").PDFDocument;
  try {
    pdf = await PDFDocument.load(input.originalPdf, { ignoreEncryption: false });
  } catch {
    throw new ContractDocumentParseError("encrypted_document", "Encrypted PDFs must be unlocked before OCR.");
  }

  const replacements = new Map<number, ContractDocumentPage>();
  for (const page of weakPages) {
    try {
      const singlePage = await PDFDocument.create();
      const [copied] = await singlePage.copyPages(pdf, [page.pageNumber - 1]);
      singlePage.addPage(copied);
      const bytes = await singlePage.save();
      const result = await input.provider.performOcr({
        buffer: Buffer.from(bytes),
        fileName: `${input.fileName}-page-${page.pageNumber}.pdf`,
        mimeType: "application/pdf",
        asynchronousPreferred: false
      });
      if (result.status !== "completed" || !result.text?.trim()) {
        replacements.set(page.pageNumber, {
          ...page,
          warningCodes: [...page.warningCodes, "ocr_page_failed"]
        });
        continue;
      }
      const text = normalizeText(result.text);
      replacements.set(page.pageNumber, {
        pageNumber: page.pageNumber,
        text,
        textHash: hashText(text),
        extractionMethod: "ocr",
        ocrConfidence: result.averageConfidence,
        blocks: blocksForText(text),
        warningCodes: result.averageConfidence !== null && result.averageConfidence < 0.75
          ? ["ocr_low_confidence"]
          : []
      });
    } catch {
      replacements.set(page.pageNumber, {
        ...page,
        warningCodes: [...page.warningCodes, "ocr_page_failed"]
      });
    }
  }

  const pages = input.document.pages.map((page) => replacements.get(page.pageNumber) ?? page);
  return {
    ...input.document,
    pages,
    warnings: pages.flatMap((page) => page.warningCodes)
  };
}

export function buildDocumentChunks(pages: ContractDocumentPage[]): ContractDocumentChunk[] {
  const chunks: ContractDocumentChunk[] = [];
  for (const page of pages) {
    if (!page.text) continue;
    let start = 0;
    while (start < page.text.length) {
      const end = Math.min(page.text.length, start + MAX_PROVIDER_CHUNK_CHARACTERS);
      chunks.push({
        chunkIndex: chunks.length,
        pageNumber: page.pageNumber,
        text: page.text.slice(start, end),
        pageStartOffset: start,
        pageEndOffset: end,
        extractionMethod: page.extractionMethod,
        ocrConfidence: page.ocrConfidence
      });
      if (end === page.text.length) break;
      start = Math.max(end - PROVIDER_CHUNK_OVERLAP, start + 1);
    }
  }
  return chunks;
}
