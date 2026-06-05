import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminSupabaseClient = vi.fn();
const getOcrProvider = vi.fn();
const extractContractMetadata = vi.fn();
const recordProcessingError = vi.fn();
const logServerWarn = vi.fn();
const emitOperationalEvent = vi.fn();

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

vi.mock("@/lib/observability/server-logger", () => ({
  logServerWarn,
  sanitizeOperationalError: (error: unknown) =>
    error instanceof Error ? { name: error.name, message: "[REDACTED]" } : error
}));

vi.mock("@/lib/observability/monitoring", () => ({
  emitOperationalEvent
}));

function createAdminMock(input?: {
  staleOcrJobs?: Array<Record<string, unknown>>;
}) {
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
            const isStaleRescue =
              payload.status === "retry_pending" &&
              payload.error_message ===
                "OCR processing lease expired. Returned to retry_pending for rescue.";
            return {
              eq() {
                return this;
              },
              lt() {
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
              },
              select() {
                if (isStaleRescue) {
                  return Promise.resolve({
                    data: input?.staleOcrJobs ?? [],
                    error: null
                  });
                }

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
          select(selection: string) {
            return {
              eq() {
                return this;
              },
              async maybeSingle() {
                if (selection.includes("contract_files")) {
                  return {
                    data: {
                      contract_files: [
                        {
                          id: "file-1",
                          file_name: "scan.pdf",
                          mime_type: "application/pdf"
                        }
                      ]
                    },
                    error: null
                  };
                }

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
    emitOperationalEvent.mockResolvedValue({});
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
  }, 15000);

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
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ocr_job_claimed",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          job_id: "job-1",
          contract_id: "contract-1"
        })
      })
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ocr_job_completed",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          job_id: "job-1",
          status: "completed"
        })
      })
    );
    expect(recordProcessingError).not.toHaveBeenCalled();
  });

  it("rescues stale OCR jobs before claiming new work", async () => {
    const mock = createAdminMock({
      staleOcrJobs: [
        {
          id: "job-stale",
          organization_id: "org-1",
          contract_id: "contract-stale"
        }
      ]
    });
    createAdminSupabaseClient.mockReturnValue(mock.client);
    getOcrProvider.mockReturnValue({
      performOcr: vi.fn().mockRejectedValue(new Error("stop after rescue"))
    });

    const { processPendingOcrJobs } = await import("@/lib/ocr/jobs");
    await processPendingOcrJobs(1);

    expect(mock.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "ocr_jobs",
          payload: expect.objectContaining({
            status: "retry_pending",
            error_message:
              "OCR processing lease expired. Returned to retry_pending for rescue."
          })
        })
      ])
    );
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ocr_job_stale_rescued",
        organizationId: "org-1",
        metadata: expect.objectContaining({
          job_id: "job-stale",
          contract_id: "contract-stale",
          rescue_state: "retry_pending"
        })
      })
    );
  });

  it("records OCR failures without leaking raw OCR or contract text into errors/log metadata", async () => {
    const mock = createAdminMock();
    createAdminSupabaseClient.mockReturnValue(mock.client);
    getOcrProvider.mockReturnValue({
      performOcr: vi.fn().mockRejectedValue(
        new Error("Raw OCR text: confidential renewal clause should never be logged")
      )
    });

    const { processPendingOcrJobs } = await import("@/lib/ocr/jobs");
    const results = await processPendingOcrJobs(1);

    expect(results).toEqual([
      {
        id: "job-1",
        status: "failed",
        error: "OCR processing failed. The failure was recorded without OCR text."
      }
    ]);
    expect(recordProcessingError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "OCR processing failed. The failure was recorded without OCR text.",
        details: { job_id: "job-1" }
      })
    );
    expect(JSON.stringify(recordProcessingError.mock.calls)).not.toContain("confidential renewal clause");
    expect(logServerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "ocr_job_failed",
        metadata: expect.objectContaining({
          job_id: "job-1",
          contract_id: "contract-1",
          failure_code: "ERR_OCR_JOB_TERMINAL_FAILURE_001",
          failure_category: "ocr_job_terminal_failure"
        }),
        error: {
          name: "Error",
          message: "[REDACTED]"
        }
      })
    );
    expect(JSON.stringify(logServerWarn.mock.calls)).not.toContain("confidential renewal clause");
    expect(emitOperationalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "ocr_job_terminal_failed",
        severity: "P2",
        alert: true,
        metadata: expect.objectContaining({
          job_id: "job-1",
          failure_code: "ERR_OCR_JOB_TERMINAL_FAILURE_001"
        }),
        error: {
          name: "Error",
          message: "[REDACTED]"
        }
      })
    );
    expect(JSON.stringify(emitOperationalEvent.mock.calls)).not.toContain(
      "confidential renewal clause"
    );
  });
});
