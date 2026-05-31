import { getAppConfig } from "@/lib/config";
import { MockOcrProvider } from "@/lib/ocr/providers/mock";
import { OpenAiOcrProvider } from "@/lib/ocr/providers/openai";
import type { OcrProvider } from "@/lib/ocr/types";

export function getOcrProvider(): OcrProvider {
  switch ((getAppConfig().ocr.provider ?? "").toLowerCase()) {
    case "mock":
      return new MockOcrProvider();
    case "openai":
      return new OpenAiOcrProvider();
    default:
      throw new Error("OCR provider is not configured.");
  }
}
