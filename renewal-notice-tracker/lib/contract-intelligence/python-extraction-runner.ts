import { createHash } from "node:crypto";
import {
  COMMERCIAL_EXTRACTION_PROMPT_VERSION,
  COMMERCIAL_EXTRACTION_SCHEMA_VERSION
} from "@/lib/contract-intelligence/commercial-schema";
import {
  applySelectiveOcrFallback,
  parseContractDocument
} from "@/lib/contract-intelligence/document-parser";
import { extractFullCommercialDocument } from "@/lib/contract-intelligence/full-document-extractor";
import { OpenAiCommercialExtractionProvider } from "@/lib/contract-intelligence/openai-commercial-extractor";
import {
  failContractExtractionRun,
  recordContractExtractionResult,
  requestContractExtraction
} from "@/lib/contract-intelligence/extraction-runs";
import {
  getAdminScopedContractFile,
  replaceAdminContractDocumentPages,
  updateAdminContractExtractionRun
} from "@/lib/contract-intelligence/repositories/admin-extraction-repository";
import { getOcrProvider } from "@/lib/ocr/provider";

function extractionIdempotencyKey(input: {
  organizationId: string;
  contractId: string;
  contractFileId: string;
  model: string;
}) {
  return createHash("sha256")
    .update([
      input.organizationId,
      input.contractId,
      input.contractFileId,
      COMMERCIAL_EXTRACTION_SCHEMA_VERSION,
      COMMERCIAL_EXTRACTION_PROMPT_VERSION,
      input.model
    ].join(":"))
    .digest("hex");
}

function safeFailureMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    return `Contract extraction failed (${String((error as { code?: unknown }).code)}).`;
  }
  return "Contract extraction failed before complete evidence could be recorded.";
}

export async function runFullDocumentContractExtraction(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  requestedByUserId?: string | null;
  forceReprocess?: boolean;
}) {
  const fileResult = await getAdminScopedContractFile({
    organizationId: input.organizationId,
    contractId: input.contractId,
    contractFileId: input.contractFileId ?? null
  });
  if (fileResult.error || !fileResult.data) {
    throw fileResult.error ?? new Error("Scoped contract file was not found.");
  }

  const provider = new OpenAiCommercialExtractionProvider();
  const baseKey = extractionIdempotencyKey({
    organizationId: input.organizationId,
    contractId: input.contractId,
    contractFileId: fileResult.data.id,
    model: provider.modelName
  });
  const idempotencyKey = input.forceReprocess ? `${baseKey}:${Date.now()}` : baseKey;
  const run = await requestContractExtraction({
    organizationId: input.organizationId,
    contractId: input.contractId,
    contractFileId: fileResult.data.id,
    requestedByUserId: input.requestedByUserId ?? null,
    extractionMode: "provider_backed",
    idempotencyKey,
    schemaVersion: COMMERCIAL_EXTRACTION_SCHEMA_VERSION,
    promptVersion: COMMERCIAL_EXTRACTION_PROMPT_VERSION
  });

  const activeLease = run.processing_lease_expires_at
    ? new Date(run.processing_lease_expires_at).getTime() > Date.now()
    : false;
  if (["completed", "partial"].includes(run.status) || (run.status === "processing" && activeLease)) {
    return { ok: true as const, run, fields: [], idempotentReplay: true };
  }

  await updateAdminContractExtractionRun({
    organizationId: input.organizationId,
    runId: run.id,
    values: {
      status: "processing",
      started_at: new Date().toISOString(),
      attempt_count: (run.attempt_count ?? 0) + 1,
      processing_lease_expires_at: new Date(Date.now() + 5 * 60_000).toISOString()
    }
  });

  try {
    let document = await parseContractDocument({
      fileId: fileResult.data.id,
      buffer: fileResult.data.bytes,
      mimeType: fileResult.data.mimeType
    });

    if (document.pages.some((page) => page.warningCodes.includes("native_page_text_insufficient"))) {
      try {
        document = await applySelectiveOcrFallback({
          document,
          originalPdf: fileResult.data.bytes,
          fileName: fileResult.data.fileName,
          provider: getOcrProvider()
        });
      } catch {
        document = { ...document, warnings: [...document.warnings, "ocr_provider_unavailable"] };
      }
    }

    const pageResult = await replaceAdminContractDocumentPages({
      organizationId: input.organizationId,
      contractId: input.contractId,
      contractFileId: fileResult.data.id,
      extractionRunId: run.id,
      pages: document.pages.map((page) => ({
        page_number: page.pageNumber,
        section_heading: page.blocks.find((block) => block.sectionHeading)?.sectionHeading ?? null,
        normalized_text: page.text,
        text_hash: page.textHash,
        character_start: 0,
        character_end: page.text.length,
        extraction_method: page.extractionMethod,
        ocr_confidence: page.ocrConfidence,
        warning_codes: page.warningCodes,
        retention_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString()
      }))
    });
    if (pageResult.error) throw pageResult.error;

    const extraction = await extractFullCommercialDocument({ document, provider });
    const recorded = await recordContractExtractionResult({
      organizationId: input.organizationId,
      contractId: input.contractId,
      extractionRunId: run.id,
      actorUserId: input.requestedByUserId ?? null,
      result: {
        provider: provider.providerName,
        extractionMode: "provider_backed",
        status: extraction.status,
        fields: extraction.fields.map((field) => ({
          fieldKey: field.fieldKey,
          extractedValue: field.rawValue,
          normalizedValue: field.normalizedValue,
          confidence: field.confidence,
          citations: [{
            sourceFileId: field.citation.sourceFileId,
            page: field.citation.pageNumber,
            snippet: field.citation.snippet,
            offsets: { start: field.citation.startOffset, end: field.citation.endOffset }
          }],
          warningCodes: field.warningCodes,
          category: field.category,
          sectionLabel: field.citation.sectionLabel,
          clauseLabel: field.citation.clauseLabel,
          extractionMethod: field.citation.extractionMethod,
          provider: field.provider,
          model: field.model,
          promptVersion: field.promptVersion,
          schemaVersion: field.schemaVersion
        })),
        overallConfidence: extraction.fields.length
          ? Number((extraction.fields.reduce((sum, field) => sum + field.confidence, 0) / extraction.fields.length).toFixed(3))
          : 0,
        warnings: extraction.warnings,
        pageCount: document.pages.length,
        processedPageCount: extraction.processedPageCount,
        inputCharacterCount: extraction.inputCharacterCount,
        inputTokenCount: extraction.inputTokenCount,
        outputTokenCount: extraction.outputTokenCount,
        model: extraction.model
      }
    });

    return {
      ok: true as const,
      run: recorded.run,
      fields: recorded.fields,
      computedEvidenceConfidence: recorded.computedEvidenceConfidence,
      idempotentReplay: false
    };
  } catch (error) {
    await failContractExtractionRun({
      organizationId: input.organizationId,
      contractId: input.contractId,
      extractionRunId: run.id,
      actorUserId: input.requestedByUserId ?? null,
      safeErrorMessage: safeFailureMessage(error)
    });
    return {
      ok: false as const,
      runId: run.id,
      errorCode: error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "contract_extraction_failed",
      safeMessage: safeFailureMessage(error)
    };
  }
}

/** @deprecated Kept only for existing imports. */
export const runPythonContractExtraction = runFullDocumentContractExtraction;
