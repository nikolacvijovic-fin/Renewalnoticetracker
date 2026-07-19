import { describe, expect, it, vi } from "vitest";
import { callAddOnJson, sha256Hex, signAddOnRequest } from "@/lib/add-ons/client-core";
import { checkPythonIntelligenceHealth, extractContract } from "@/lib/add-ons/python-intelligence-client";
import { checkGoWorkerHealth, enqueueGoWorkerJob } from "@/lib/add-ons/go-worker-client";
import { checkJavaEnterpriseHealth } from "@/lib/add-ons/java-enterprise-client";

describe("add-on clients", () => {
  it("returns a safe not-configured result when base URL is missing", async () => {
    await expect(callAddOnJson({ addOnId: "python_contract_intelligence", baseUrl: null, path: "/health" })).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: "not_configured",
        safeMessage: "Add-on service URL is not configured."
      })
    );
  });

  it("performs health checks with correlation IDs", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(init?.headers).toEqual(expect.objectContaining({ "x-request-correlation-id": "corr-1" }));
      return Response.json({ service: "python-intelligence", version: "0.1.0", status: "ok" });
    });

    const result = await checkPythonIntelligenceHealth({
      baseUrl: "https://python.example.com",
      fetchImpl,
      timeoutMs: 1000,
      correlationId: "corr-1",
      signingSecret: null
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        output: expect.objectContaining({ status: "ok" })
      })
    );
  });

  it("maps transport failures without leaking raw errors", async () => {
    const result = await checkGoWorkerHealth({
      baseUrl: "https://worker.example.com",
      signingSecret: null,
      fetchImpl: vi.fn(async () => {
        throw new Error("raw provider payload with token should not leak");
      })
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: "transport_error",
        safeMessage: "Add-on service request failed."
      })
    );
    expect(JSON.stringify(result)).not.toContain("raw provider payload");
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("times out slow add-on requests safely", async () => {
    const fetchImpl = vi.fn((_url: URL | RequestInfo, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
    );

    const result = await checkJavaEnterpriseHealth({
      baseUrl: "https://java.example.com",
      fetchImpl,
      signingSecret: null,
      timeoutMs: 1
    });

    expect(result).toEqual(expect.objectContaining({ ok: false, errorCode: "timeout" }));
  });

  it("preserves typed request and response shapes for service methods", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.organization_id).toBe("org-1");
      return Response.json({
        vendor_name: null,
        renewal_date: null,
        notice_deadline: null,
        auto_renew: null,
        contract_value: null,
        currency: null,
        extracted_fields: {},
        evidence_confidence: 0,
        citations: [],
        warnings: ["deterministic_scaffold_no_ai_provider_called"]
      });
    });

    const result = await extractContract(
      {
        organization_id: "org-1",
        contract_id: "contract-1",
        file_id: "file-1",
        extraction_mode: "deterministic_scaffold"
      },
      { baseUrl: "https://python.example.com", fetchImpl, signingSecret: "test-add-on-secret" }
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it("keeps worker job requests org-scoped and idempotent", async () => {
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual(
        expect.objectContaining({
          organization_id: "org-1",
          idempotency_key: "job-key-1"
        })
      );
      return Response.json({ accepted: true, job_id: "job-1", status: "queued" });
    });

    const result = await enqueueGoWorkerJob(
      {
        organization_id: "org-1",
        job_type: "reminder_delivery",
        idempotency_key: "job-key-1",
        payload: { reminder_id: "reminder-1" }
      },
      { baseUrl: "https://worker.example.com", fetchImpl, signingSecret: "test-add-on-secret" }
    );

    expect(result).toEqual(expect.objectContaining({ ok: true }));
  });

  it("signs protected add-on requests over method, path, timestamp, and body hash", async () => {
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      const requestUrl = url as URL;
      const headers = init?.headers as Record<string, string>;
      const body = String(init?.body);
      const timestamp = headers["x-noticecontrol-timestamp"];
      const bodyHash = sha256Hex(body);

      expect(timestamp).toBeTruthy();
      expect(headers["x-noticecontrol-body-sha256"]).toBe(bodyHash);
      expect(headers["x-noticecontrol-signature"]).toBe(
        signAddOnRequest({
          method: "POST",
          path: requestUrl.pathname,
          timestamp: timestamp ?? "",
          bodySha256: bodyHash,
          secret: "test-add-on-secret"
        })
      );

      return Response.json({
        vendor_name: null,
        renewal_date: null,
        notice_deadline: null,
        auto_renew: null,
        contract_value: null,
        currency: null,
        extracted_fields: {},
        evidence_confidence: 0,
        citations: [],
        warnings: []
      });
    });

    await extractContract(
      {
        organization_id: "org-1",
        contract_id: "contract-1",
        file_id: "file-1",
        extraction_mode: "deterministic_scaffold"
      },
      { baseUrl: "https://python.example.com", fetchImpl, signingSecret: "test-add-on-secret" }
    );
  });

  it("fails protected calls closed when the signing secret is missing", async () => {
    const result = await extractContract(
      {
        organization_id: "org-1",
        contract_id: "contract-1",
        file_id: "file-1",
        extraction_mode: "deterministic_scaffold"
      },
      { baseUrl: "https://python.example.com", signingSecret: null }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: "not_configured",
        safeMessage: "Add-on internal signing secret is not configured."
      })
    );
  });
});
