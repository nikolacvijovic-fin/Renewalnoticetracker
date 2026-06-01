import { describe, expect, it, vi } from "vitest";
import { buildServerLogEntry, logServerError } from "@/lib/observability/server-logger";

describe("structured server logger", () => {
  it("redacts sensitive metadata and does not log raw notes, payloads, tokens, or evidence", () => {
    const entry = buildServerLogEntry("error", {
      event: "route_unexpected_error",
      organizationId: "org-1",
      actorUserId: "user-1",
      route: "/api/internal/ocr-jobs",
      requestId: "request-1",
      metadata: {
        safe_count: 2,
        note_body: "full note should not be logged",
        raw_contract_text: "raw contract should not be logged",
        extracted_evidence: "clause evidence should not be logged",
        auth_token: "token should not be logged",
        nested: {
          provider_payload: "provider payload should not be logged",
          status: "failed"
        }
      }
    });

    expect(JSON.stringify(entry)).toContain("safe_count");
    expect(JSON.stringify(entry)).toContain("failed");
    expect(JSON.stringify(entry)).not.toContain("full note should not be logged");
    expect(JSON.stringify(entry)).not.toContain("raw contract should not be logged");
    expect(JSON.stringify(entry)).not.toContain("clause evidence should not be logged");
    expect(JSON.stringify(entry)).not.toContain("token should not be logged");
    expect(JSON.stringify(entry)).not.toContain("provider payload should not be logged");
    expect(entry.metadata).toMatchObject({
      note_body: "[REDACTED]",
      raw_contract_text: "[REDACTED]",
      extracted_evidence: "[REDACTED]",
      auth_token: "[REDACTED]",
      nested: {
        provider_payload: "[REDACTED]",
        status: "failed"
      }
    });
  });

  it("emits JSON structured logs", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError({
      event: "export_failed",
      organizationId: "org-1",
      actorUserId: "user-1",
      route: "/dashboard/contracts/export/csv",
      requestId: "request-1",
      metadata: { row_count: 0 }
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('"event":"export_failed"')
    );
    spy.mockRestore();
  });

  it("redacts error messages so thrown contract or OCR details cannot leak", () => {
    const entry = buildServerLogEntry("error", {
      event: "ocr_job_failed",
      route: "/api/internal/ocr-jobs",
      error: new Error("raw contract text and extracted evidence should not be logged")
    });

    expect(JSON.stringify(entry)).not.toContain("raw contract text");
    expect(JSON.stringify(entry)).not.toContain("extracted evidence should not be logged");
    expect(entry.error).toMatchObject({
      name: "Error",
      message: "[REDACTED]"
    });
  });
});
