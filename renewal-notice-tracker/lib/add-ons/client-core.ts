import type { AddOnExecutionResult } from "@/lib/add-ons/add-on-registry";
import { createHash, createHmac } from "node:crypto";

export type AddOnClientOptions = {
  addOnId: string;
  baseUrl: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  correlationId?: string;
  signingSecret?: string | null;
};

export type AddOnHealthResponse = {
  service: string;
  version: string;
  status: "ok" | "degraded" | "unavailable";
};

export function makeCorrelationId(prefix = "addon") {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function signAddOnRequest(input: {
  method: string;
  path: string;
  timestamp: string;
  bodySha256: string;
  secret: string;
}) {
  const payload = [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.bodySha256
  ].join("\n");
  return `sha256=${createHmac("sha256", input.secret).update(payload).digest("hex")}`;
}

function safeTransportMessage(status?: number) {
  if (typeof status === "number") {
    return `Add-on service returned ${status}.`;
  }
  return "Add-on service is not available.";
}

export async function callAddOnJson<TInput, TOutput>(
  options: AddOnClientOptions & {
    path: string;
    method?: "GET" | "POST";
    body?: TInput;
    correlationId?: string;
  }
): Promise<AddOnExecutionResult<TOutput>> {
  const correlationId = options.correlationId ?? makeCorrelationId(options.addOnId);
  if (!options.baseUrl) {
    return {
      ok: false,
      addOnId: options.addOnId,
      errorCode: "not_configured",
      safeMessage: "Add-on service URL is not configured.",
      correlationId
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 2500);
  const fetcher = options.fetchImpl ?? fetch;
  const method = options.method ?? (options.body ? "POST" : "GET");
  const body = options.body ? JSON.stringify(options.body) : "";
  const requestUrl = new URL(options.path, options.baseUrl);
  const signedPath = `${requestUrl.pathname}${requestUrl.search}`;
  const bodySha256 = sha256Hex(body);
  const timestamp = new Date().toISOString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-request-correlation-id": correlationId
  };
  const requiresSignature = method !== "GET";

  if (requiresSignature && !options.signingSecret) {
    clearTimeout(timeout);
    return {
      ok: false,
      addOnId: options.addOnId,
      errorCode: "not_configured",
      safeMessage: "Add-on internal signing secret is not configured.",
      correlationId
    };
  }

  if (options.signingSecret) {
    headers["x-noticecontrol-timestamp"] = timestamp;
    headers["x-noticecontrol-body-sha256"] = bodySha256;
    headers["x-noticecontrol-signature"] = signAddOnRequest({
      method,
      path: signedPath,
      timestamp,
      bodySha256,
      secret: options.signingSecret
    });
  }

  try {
    const response = await fetcher(requestUrl, {
      method,
      headers,
      body: body ? body : undefined,
      signal: controller.signal
    });

    if (!response.ok) {
      return {
        ok: false,
        addOnId: options.addOnId,
        errorCode: "transport_error",
        safeMessage: safeTransportMessage(response.status),
        correlationId
      };
    }

    return {
      ok: true,
      addOnId: options.addOnId,
      output: (await response.json()) as TOutput,
      correlationId
    };
  } catch (error) {
    const aborted =
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError";
    return {
      ok: false,
      addOnId: options.addOnId,
      errorCode: aborted ? "timeout" : "transport_error",
      safeMessage: aborted ? "Add-on service timed out." : "Add-on service request failed.",
      correlationId
    };
  } finally {
    clearTimeout(timeout);
  }
}
