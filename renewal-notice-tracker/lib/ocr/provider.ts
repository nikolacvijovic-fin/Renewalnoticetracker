import { env } from "@/lib/env";
import { MockOcrProvider } from "@/lib/ocr/providers/mock";
import { OpenAiOcrProvider } from "@/lib/ocr/providers/openai";
import type { OcrProvider } from "@/lib/ocr/types";

export function getOcrProvider(): OcrProvider {
  switch ((env.OCR_PROVIDER ?? "").toLowerCase()) {
    case "mock":
      return new MockOcrProvider();
    case "openai":
      return new OpenAiOcrProvider();
    default:
      throw new Error("OCR provider is not configured.");
  }
}
