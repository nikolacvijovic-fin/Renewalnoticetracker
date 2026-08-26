import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { getAppConfig } from "@/lib/config";
import {
  COMMERCIAL_EXTRACTION_PROMPT_VERSION,
  COMMERCIAL_EXTRACTION_SCHEMA_VERSION,
  categoryForCommercialField,
  isCommercialFieldKey,
  type CommercialFieldCandidate
} from "@/lib/contract-intelligence/commercial-schema";
import type { ContractDocumentChunk } from "@/lib/contract-intelligence/document-parser";

const providerFieldSchema = z.object({
  field_key: z.string(),
  raw_value: z.union([z.string(), z.number(), z.boolean()]),
  normalized_value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
  confidence: z.number().min(0).max(1),
  source_snippet: z.string().max(700),
  start_offset: z.number().int().nonnegative().nullable(),
  end_offset: z.number().int().nonnegative().nullable(),
  section_label: z.string().max(180).nullable(),
  clause_label: z.string().max(180).nullable(),
  warning_codes: z.array(z.string().max(80)).max(12)
});

const providerResponseSchema = z.object({
  fields: z.array(providerFieldSchema).max(80),
  warnings: z.array(z.string().max(100)).max(25)
});

export type CommercialExtractionProviderResult = {
  fields: CommercialFieldCandidate[];
  warnings: string[];
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export interface CommercialExtractionProvider {
  readonly providerName: string;
  readonly modelName: string;
  extractChunk(input: {
    fileId: string;
    chunk: ContractDocumentChunk;
  }): Promise<CommercialExtractionProviderResult>;
}

function normalizeSnippet(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function anchoredSnippet(chunkText: string, candidate: string) {
  const normalizedChunk = normalizeSnippet(chunkText);
  const normalizedCandidate = normalizeSnippet(candidate);
  if (!normalizedCandidate || !normalizedChunk.includes(normalizedCandidate)) return null;
  return normalizedCandidate.slice(0, 500);
}

export class OpenAiCommercialExtractionProvider implements CommercialExtractionProvider {
  readonly providerName = "openai";
  readonly modelName: string;
  private readonly client: OpenAI;

  constructor() {
    const config = getAppConfig();
    this.modelName = config.ai.openaiModel;
    this.client = new OpenAI({ apiKey: config.ai.openaiApiKey });
  }

  async extractChunk(input: {
    fileId: string;
    chunk: ContractDocumentChunk;
  }): Promise<CommercialExtractionProviderResult> {
    const response = await this.client.beta.chat.completions.parse({
      model: this.modelName,
      temperature: 0,
      response_format: zodResponseFormat(providerResponseSchema, "commercial_contract_chunk"),
      messages: [
        {
          role: "system",
          content: [
            "Extract commercial contract facts only from the supplied page chunk.",
            "Never infer a date role from ordering. Unsupported fields must be omitted.",
            "Every field must quote an exact short source snippet from this chunk.",
            "Return facts, not legal advice, recommendations, or realized-savings claims."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            schemaVersion: COMMERCIAL_EXTRACTION_SCHEMA_VERSION,
            promptVersion: COMMERCIAL_EXTRACTION_PROMPT_VERSION,
            pageNumber: input.chunk.pageNumber,
            allowedFieldKeys: [
              "contract_title", "document_type", "vendor_name", "customer_party", "effective_date",
              "execution_date", "governing_agreement_references", "amendment_references", "initial_term",
              "expiration_date", "renewal_date", "auto_renewal", "renewal_term", "notice_period",
              "notice_deadline_date", "termination_for_convenience", "termination_for_cause",
              "early_termination_fees", "non_renewal_delivery_method", "non_renewal_recipient",
              "contract_value_amount", "contract_value_currency", "billing_frequency", "payment_terms",
              "payment_timing_trigger", "committed_annual_cost", "total_committed_cost", "minimum_spend",
              "one_time_fees", "recurring_fees", "unit_prices", "quantities", "products", "discounts",
              "discount_expiration", "credits", "taxes", "automatic_price_increase",
              "fixed_uplift_percentage", "index_linked_increase", "uplift_cap_percentage",
              "price_review_date", "vendor_price_change_rights", "price_change_notice_requirement",
              "renewal_pricing_basis", "service_level_credits", "volume_commitments", "usage_commitments",
              "take_or_pay_obligations", "exclusivity", "minimum_purchase_obligations", "overage_pricing",
              "data_export_charges", "transition_charges", "post_termination_assistance_charges"
            ],
            pageText: input.chunk.text
          })
        }
      ]
    });

    const parsed = response.choices[0]?.message.parsed;
    if (!parsed) throw new Error("The configured extraction provider returned no structured output.");

    const warnings = new Set(parsed.warnings);
    const fields: CommercialFieldCandidate[] = [];
    for (const field of parsed.fields) {
      if (!isCommercialFieldKey(field.field_key)) {
        warnings.add("provider_returned_unknown_field_key");
        continue;
      }
      const snippet = anchoredSnippet(input.chunk.text, field.source_snippet);
      if (!snippet) {
        warnings.add("provider_citation_not_anchored");
        continue;
      }
      const start = field.start_offset;
      const end = field.end_offset;
      const offsetsValid = start !== null && end !== null && start <= end && end <= input.chunk.text.length;
      fields.push({
        fieldKey: field.field_key,
        category: categoryForCommercialField(field.field_key),
        rawValue: field.raw_value,
        normalizedValue: field.normalized_value,
        confidence: field.confidence,
        citation: {
          sourceFileId: input.fileId,
          pageNumber: input.chunk.pageNumber,
          sectionLabel: field.section_label,
          clauseLabel: field.clause_label,
          snippet,
          startOffset: offsetsValid ? input.chunk.pageStartOffset + start : null,
          endOffset: offsetsValid ? input.chunk.pageStartOffset + end : null,
          extractionMethod: input.chunk.extractionMethod,
          ocrConfidence: input.chunk.ocrConfidence
        },
        warningCodes: [
          ...field.warning_codes,
          ...(!offsetsValid ? ["provider_offsets_unverified"] : []),
          ...(input.chunk.extractionMethod === "ocr" ? ["ocr_assisted"] : [])
        ],
        provider: this.providerName,
        model: this.modelName,
        promptVersion: COMMERCIAL_EXTRACTION_PROMPT_VERSION,
        schemaVersion: COMMERCIAL_EXTRACTION_SCHEMA_VERSION
      });
    }

    return {
      fields,
      warnings: Array.from(warnings),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
      model: this.modelName
    };
  }
}
