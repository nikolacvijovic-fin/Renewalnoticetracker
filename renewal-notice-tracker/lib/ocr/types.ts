export type OcrGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OcrLineBlock = {
  text: string;
  confidence: number | null;
  geometry: OcrGeometry | null;
};

export type OcrPage = {
  pageNumber: number;
  text: string;
  confidence: number | null;
  lines: OcrLineBlock[];
};

export type OcrProviderResult =
  | {
      status: "completed";
      provider: string;
      processingMode: "sync" | "async";
      text: string;
      averageConfidence: number | null;
      pages: OcrPage[];
      estimatedCost: number | null;
      rawMetadata?: Record<string, unknown>;
    }
  | {
      status: "async_required" | "failed";
      provider: string;
      processingMode: "sync" | "async";
      error: string;
      averageConfidence: number | null;
      estimatedCost: number | null;
      rawMetadata?: Record<string, unknown>;
    };

export type PerformOcrInput = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  asynchronousPreferred?: boolean;
};

export interface OcrProvider {
  readonly name: string;
  performOcr(input: PerformOcrInput): Promise<OcrProviderResult>;
}
