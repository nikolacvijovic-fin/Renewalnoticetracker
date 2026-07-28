import { extractContract, type ExtractContractResponse } from "@/lib/add-ons/python-intelligence-client";
import {
  failContractExtractionRun,
  recordContractExtractionResult,
  requestContractExtraction
} from "@/lib/contract-intelligence/extraction-runs";
import {
  isExtractedFieldKey,
  type ContractExtractionMode,
  type ContractExtractionResultField
} from "@/lib/contract-intelligence/extraction-types";
import type { Json } from "@/lib/supabase/database.types";

function normalizePythonResponse(response: ExtractContractResponse, extractionMode: ContractExtractionMode) {
  const fields: ContractExtractionResultField[] = [];

  for (const field of response.fields) {
    if (!isExtractedFieldKey(field.field_key)) continue;
    fields.push({
      fieldKey: field.field_key,
      extractedValue: field.extracted_value as Json,
      normalizedValue: (field.normalized_value ?? null) as Json | null,
      confidence: field.confidence,
      citations: field.citations.map((citation) => ({
        sourceFileId: citation.source_file_id ?? null,
        page: citation.page ?? null,
        snippet: citation.snippet ?? null,
        offsets: (citation.offsets ?? null) as Record<string, Json | undefined> | null
      })),
      warningCodes: field.warning_codes
    });
  }

  return {
    provider: "python_intelligence",
    extractionMode,
    fields,
    overallConfidence: response.overall_confidence,
    warnings: response.warnings
  };
}

export async function runPythonContractExtraction(input: {
  organizationId: string;
  contractId: string;
  contractFileId?: string | null;
  fileUrl?: string | null;
  sampleText?: string | null;
  requestedByUserId?: string | null;
  extractionMode?: ContractExtractionMode;
}) {
  const extractionMode = input.extractionMode ?? "deterministic_scaffold";
  const run = await requestContractExtraction({
    organizationId: input.organizationId,
    contractId: input.contractId,
    contractFileId: input.contractFileId ?? null,
    requestedByUserId: input.requestedByUserId ?? null,
    extractionMode
  });

  const response = await extractContract({
    organization_id: input.organizationId,
    contract_id: input.contractId,
    file_id: input.contractFileId ?? undefined,
    file_url: input.fileUrl ?? undefined,
    sample_text: input.sampleText ?? undefined,
    extraction_mode: extractionMode
  });

  if (!response.ok) {
    await failContractExtractionRun({
      organizationId: input.organizationId,
      contractId: input.contractId,
      extractionRunId: run.id,
      actorUserId: input.requestedByUserId ?? null,
      safeErrorMessage: response.safeMessage
    });
    return {
      ok: false as const,
      runId: run.id,
      errorCode: response.errorCode,
      safeMessage: response.safeMessage
    };
  }

  const recorded = await recordContractExtractionResult({
    organizationId: input.organizationId,
    contractId: input.contractId,
    extractionRunId: run.id,
    actorUserId: input.requestedByUserId ?? null,
    result: normalizePythonResponse(response.output, extractionMode)
  });

  return {
    ok: true as const,
    run: recorded.run,
    fields: recorded.fields,
    computedEvidenceConfidence: recorded.computedEvidenceConfidence
  };
}
