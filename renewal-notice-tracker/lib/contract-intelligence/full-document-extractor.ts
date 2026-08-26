import {
  CRITICAL_COMMERCIAL_FIELDS,
  type CommercialFieldCandidate
} from "@/lib/contract-intelligence/commercial-schema";
import {
  buildDocumentChunks,
  type ParsedContractDocument
} from "@/lib/contract-intelligence/document-parser";
import type { CommercialExtractionProvider } from "@/lib/contract-intelligence/openai-commercial-extractor";

export type FullDocumentExtractionResult = {
  fields: CommercialFieldCandidate[];
  warnings: string[];
  status: "completed" | "partial";
  processedPageCount: number;
  inputCharacterCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
  model: string;
};

function candidateIdentity(field: CommercialFieldCandidate) {
  return [
    field.fieldKey,
    JSON.stringify(field.normalizedValue ?? field.rawValue),
    field.citation.sourceFileId,
    field.citation.pageNumber,
    field.citation.snippet
  ].join(":");
}

export async function extractFullCommercialDocument(input: {
  document: ParsedContractDocument;
  provider: CommercialExtractionProvider;
  maxAttemptsPerChunk?: number;
  chunkTimeoutMs?: number;
}): Promise<FullDocumentExtractionResult> {
  const chunks = buildDocumentChunks(input.document.pages);
  if (chunks.length === 0) {
    throw new Error("The contract contains no text that can be sent to the configured extraction provider.");
  }

  const fields: CommercialFieldCandidate[] = [];
  const warnings = new Set(input.document.warnings);
  const processedPages = new Set<number>();
  let inputTokenCount = 0;
  let outputTokenCount = 0;
  let failedChunkCount = 0;
  const maxAttempts = Math.min(3, Math.max(1, input.maxAttemptsPerChunk ?? 2));
  const chunkTimeoutMs = Math.min(120_000, Math.max(1_000, input.chunkTimeoutMs ?? 45_000));

  for (const chunk of chunks) {
    let completed = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await Promise.race([
          input.provider.extractChunk({ fileId: input.document.fileId, chunk }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("provider_chunk_timeout")), chunkTimeoutMs);
          })
        ]);
      fields.push(...result.fields);
      result.warnings.forEach((warning) => warnings.add(warning));
      inputTokenCount += result.inputTokens;
      outputTokenCount += result.outputTokens;
      processedPages.add(chunk.pageNumber);
        completed = true;
        break;
      } catch {
        if (attempt < maxAttempts) warnings.add("provider_chunk_retry");
      }
    }
    if (!completed) {
      failedChunkCount += 1;
      warnings.add("provider_chunk_failed");
    }
  }

  const unique = new Map<string, CommercialFieldCandidate>();
  for (const field of fields) {
    const key = candidateIdentity(field);
    const current = unique.get(key);
    if (!current || field.confidence > current.confidence) unique.set(key, field);
  }

  const deduplicatedFields = Array.from(unique.values());
  for (const fieldKey of CRITICAL_COMMERCIAL_FIELDS) {
    if (!deduplicatedFields.some((field) => field.fieldKey === fieldKey)) {
      warnings.add(`missing_critical_field:${fieldKey}`);
    }
  }

  const partial =
    failedChunkCount > 0 ||
    processedPages.size < input.document.pages.length ||
    input.document.pages.some((page) => page.warningCodes.includes("ocr_page_failed"));

  return {
    fields: deduplicatedFields,
    warnings: Array.from(warnings),
    status: partial ? "partial" : "completed",
    processedPageCount: processedPages.size,
    inputCharacterCount: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
    inputTokenCount,
    outputTokenCount,
    model: input.provider.modelName
  };
}
