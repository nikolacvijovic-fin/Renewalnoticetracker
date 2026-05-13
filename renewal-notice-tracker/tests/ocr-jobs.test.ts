import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const getOcrProvider = vi.fn();
const extractContractMetadata = vi.fn();
const recordProcessingError = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient
}));

vi.mock("@/lib/ocr/provider", () => ({
  getOcrProvider
}));

vi.mock("@/lib/ai/extract-contract", () => ({
  extractContractMetadata
}));

vi.mock("@/lib/contracts/processing-errors", () => ({
  recordProcessingError
}));

function createAdminMock() {
  const inserts: Array<{ table: string; payload: unknown }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const deletes: string[] = [];

  const client = {
    from(table: string) {
      if (table === "ocr_jobs") {
        return {
          insert(payload: Record<string, unknown>) {
            inserts.push({ table, payload });
            return {
              select() {
                return {
                  async single() {
                    return { data: { id: "job-1" }, error: null };
                  }
                };
              }
            };
          },
          select() {
            return {
              in() {
                return {
                  order() {
                    return {
                      async limit() {
                        return {
                          data: [
                            {
                              id: "job-1",
                              organization_id: "org-1",
                              contract_id: "contract-1",
                              contract_file_id: "file-1",
                              provider: "mock",
                              status: "pending",
                              detection_reason: "Native extraction returned no usable text.",
                              attempts: 0
                            }
                          ],
                          error: null
                        };
                      }
                    };
                  }
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq() {
                return this;
              },
              in() {
                return {
                  select() {
                    return {
                      async maybeSingle() {
                        return {
                          data: {
                            id: "job-1",
                            organization_id: "org-1",
                            contract_id: "contract-1",
                            contract_file_id: "file-1",
                            provider: "mock",
                            status: "processing",
                            detection_reason: "Native extraction returned no usable text.",
                            attempts: 1
                          },
                          error: null
                        };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }

      if (table === "contract_files") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              async single() {
                return {
                  data: { file_name: "scan.pdf", mime_type: "application/pdf" },
                  error: null
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq() {
                return this;
              }
            };
          }
        };
      }

      if (table === "contracts") {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              async maybeSingle() {
                return {
                  data: { contract_metadata: { id: "metadata-1" } },
                  error: null
                };
              }
            };
          },
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq() {
                return this;
              }
            };
          }
        };
      }

      if (table === "contract_metadata") {
        return {
          update(payload: Record<string, unknown>) {
            updates.push({ table, payload });
            return {
              eq() {
                return this;
              }
            };
          }
        };
      }

      if (table === "extracted_field_evidence") {
        return {
          delete() {
            deletes.push(table);
            return {
              eq() {
                return this;
              }
            };
          },
          async insert(payload: unknown) {
            inserts.push({ table, payload });
            return { error: null };
          }
        };
      }

      if (table === "cost_usage_logs") {
        return {
          async insert(payload: unknown) {
            inserts.push({ table, payload });
            return { error: null };
          }
        };
      }

      throw new Error(`Unexpected table ${table}`);
    }
  };

  return { client, inserts, updates, deletes };
}

describe("OCR jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues an OCR job", async () => {
    const mock = createAdminMock();
    createAdminSupabaseClient.mockReturnValue(mock.client);

    const { enqueueOcrJob } = await import("@/lib/ocr/jobs");
    const jobId = await enqueueOcrJob({
      organizationId: "org-1",
      contractId: "contract-1",
      contractFileId: "file-1",
      provider: "mock",
      detectionReason: "empty native text"
    });

    expect(jobId).toBe("job-1");
  });

  it("processes a pending OCR job and keeps the contract in review", async () => {
    const mock = createAdminMock();
    createAdminSupabaseClient.mockReturnValue(mock.client);
    getOcrProvider.mockReturnValue({
      performOcr: vi.fn().mockResolvedValue({
        status: "completed",
        provider: "mock",
        processingMode: "sync",
        text: "Scanned notice deadline",
        averageConfidence: 0.55,
        estimatedCost: 0.12,
        pages: [
          {
            pageNumber: 1,
            text: "Scanned notice deadline",
            confidence: 0.55,
            lines: []
          }
        ]
      })
    });
    extractContractMetadata.mockResolvedValue({
      contract_title: "MSA",
      counterparty_name: "Acme",
      contract_type: "MSA",
      effective_date: "2030-01-01",
      expiration_date: "2030-12-31",
      auto_renewal: true,
      renewal_term: "12 months",
      notice_period_value: 30,
      notice_period_unit: "days",
      notice_deadline_date: "2030-11-30",
      governing_law: "Serbia",
      payment_terms: "Net 30",
      extracted_clauses: [],
      field_confidence: { expiration_date: 0.9 },
      field_source_snippets: { expiration_date: "Scanned clause" },
      reminder_recommendations: [],
      reviewer_notes: null,
      needs_review: false
    });

    const { processPendingOcrJobs } = await import("@/lib/ocr/jobs");
    const results = await processPendingOcrJobs(1);

    expect(results).toEqual([{ id: "job-1", status: "completed" }]);
    expect(
      mock.updates.some(
        (entry) => entry.table === "contracts" && entry.payload.status === "needs_review"
      )
    ).toBe(true);
    expect(
      mock.inserts.some(
        (entry) => entry.table === "cost_usage_logs"
      )
    ).toBe(true);
    expect(recordProcessingError).not.toHaveBeenCalled();
  });
});
