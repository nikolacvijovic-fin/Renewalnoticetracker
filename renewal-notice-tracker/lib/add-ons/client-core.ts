import type { AddOnExecutionResult } from "@/lib/add-ons/add-on-registry";

export type AddOnClientOptions = {
  addOnId: string;
  baseUrl: string | null;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  correlationId?: string;
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

  try {
    const response = await fetcher(new URL(options.path, options.baseUrl), {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        "x-request-correlation-id": correlationId
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
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
