import { beforeEach, describe, expect, it, vi } from "vitest";

const extractContract = vi.fn();
const requestContractExtraction = vi.fn();
const recordContractExtractionResult = vi.fn();
const failContractExtractionRun = vi.fn();

vi.mock("@/lib/add-ons/python-intelligence-client", () => ({
  extractContract
}));

vi.mock("@/lib/contract-intelligence/extraction-runs", () => ({
  requestContractExtraction,
  recordContractExtractionResult,
  failContractExtractionRun
}));

describe("python contract extraction runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestContractExtraction.mockResolvedValue({
      id: "run-1",
      organization_id: "org-1",
      contract_id: "contract-1"
    });
    recordContractExtractionResult.mockResolvedValue({
      run: { id: "run-1", status: "completed" },
      fields: [],
      computedEvidenceConfidence: 0.82
    });
  });

  it("records structured Python extraction output as evidence", async () => {
    extractContract.mockResolvedValue({
      ok: true,
      output: {
        fields: [
          {
            field_key: "auto_renewal",
            extracted_value: true,
            normalized_value: true,
            confidence: 0.86,
            citations: [{ source_file_id: "file-1", page: 1, snippet: "Renews automatically." }],
            warning_codes: []
          }
        ],
        overall_confidence: 0.86,
        warnings: ["deterministic_scaffold_no_ai_provider_called"]
      }
    });
    const { runPythonContractExtraction } = await import(
      "@/lib/contract-intelligence/python-extraction-runner"
    );

    const result = await runPythonContractExtraction({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1",
      requestedByUserId: "user-1"
    });

    expect(result.ok).toBe(true);
    expect(recordContractExtractionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionRunId: "run-1",
        result: expect.objectContaining({
          fields: [
            expect.objectContaining({
              fieldKey: "auto_renewal",
              confidence: 0.86
            })
          ]
        })
      })
    );
  });

  it("marks the run failed safely when Python intelligence is not configured", async () => {
    extractContract.mockResolvedValue({
      ok: false,
      errorCode: "not_configured",
      safeMessage: "Add-on service URL is not configured."
    });
    const { runPythonContractExtraction } = await import(
      "@/lib/contract-intelligence/python-extraction-runner"
    );

    const result = await runPythonContractExtraction({
      organizationId: "org-1",
      contractId: "contract-1",
      requestedByUserId: "user-1"
    });

    expect(result.ok).toBe(false);
    expect(failContractExtractionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        extractionRunId: "run-1",
        safeErrorMessage: "Add-on service URL is not configured."
      })
    );
    expect(recordContractExtractionResult).not.toHaveBeenCalled();
  });
});
