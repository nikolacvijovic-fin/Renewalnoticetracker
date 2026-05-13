import { normalizeExtractedText } from "@/lib/extractors/file-text";
import type { OcrProvider, OcrProviderResult } from "@/lib/ocr/types";

export class MockOcrProvider implements OcrProvider {
  readonly name = "mock";

  async performOcr(input: { buffer: Buffer; fileName: string; mimeType: string }): Promise<OcrProviderResult> {
    const text = normalizeExtractedText(input.buffer.toString("utf8"));

    if (!text) {
      return {
        status: "failed",
        provider: this.name,
        processingMode: "sync",
        error: "Mock OCR did not receive any transcribable text content.",
        averageConfidence: 0.2,
        estimatedCost: 0,
        rawMetadata: { file_name: input.fileName, mime_type: input.mimeType }
      };
    }

    return {
      status: "completed",
      provider: this.name,
      processingMode: "sync",
      text,
      averageConfidence: 0.55,
      pages: [
        {
          pageNumber: 1,
          text,
          confidence: 0.55,
          lines: [
            {
              text,
              confidence: 0.55,
              geometry: null
            }
          ]
        }
      ],
      estimatedCost: 0,
      rawMetadata: { file_name: input.fileName, mime_type: input.mimeType }
    };
  }
}
