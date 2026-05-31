import { getAppConfig } from "@/lib/config";
import { normalizeExtractedText } from "@/lib/extractors/file-text";
import type { OcrProvider, OcrProviderResult } from "@/lib/ocr/types";

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractOutputText(payload: OpenAiResponse) {
  if (payload.output_text) return payload.output_text;
  return (
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" || typeof item.text === "string")
      .map((item) => item.text ?? "")
      .join("\n\n") ?? ""
  );
}

export class OpenAiOcrProvider implements OcrProvider {
  readonly name = "openai";

  async performOcr(input: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    asynchronousPreferred?: boolean;
  }): Promise<OcrProviderResult> {
    const config = getAppConfig();
    const apiKey = config.ocr.openaiApiKey ?? config.ai.openaiApiKey;
    const model = config.ocr.openaiModel ?? config.ai.openaiModel;

    if (input.asynchronousPreferred) {
      return {
        status: "async_required",
        provider: this.name,
        processingMode: "async",
        error: "This document should use asynchronous OCR because of size or scan complexity.",
        averageConfidence: null,
        estimatedCost: null,
        rawMetadata: { file_name: input.fileName, mime_type: input.mimeType }
      };
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Transcribe this document as faithfully as possible. Return the document text only. Preserve dates, headings, clauses, and renewal-related wording."
              },
              {
                type: "input_file",
                filename: input.fileName,
                file_data: `data:${input.mimeType};base64,${input.buffer.toString("base64")}`
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return {
        status: "failed",
        provider: this.name,
        processingMode: "sync",
        error: `OpenAI OCR request failed with status ${response.status}.`,
        averageConfidence: null,
        estimatedCost: null
      };
    }

    const payload = (await response.json()) as OpenAiResponse;
    const text = normalizeExtractedText(extractOutputText(payload));

    if (!text) {
      return {
        status: "failed",
        provider: this.name,
        processingMode: "sync",
        error: "OpenAI OCR returned no usable text.",
        averageConfidence: null,
        estimatedCost: null,
        rawMetadata: { file_name: input.fileName, mime_type: input.mimeType }
      };
    }

    return {
      status: "completed",
      provider: this.name,
      processingMode: "sync",
      text,
      averageConfidence: 0.6,
      pages: [
        {
          pageNumber: 1,
          text,
          confidence: 0.6,
          lines: []
        }
      ],
      estimatedCost: null,
      rawMetadata: { file_name: input.fileName, mime_type: input.mimeType }
    };
  }
}
