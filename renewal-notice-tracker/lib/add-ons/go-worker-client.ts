import { callAddOnJson, type AddOnClientOptions, type AddOnHealthResponse } from "@/lib/add-ons/client-core";
import { getAppConfig } from "@/lib/config";

export type GoWorkerJobRequest = {
  organization_id: string;
  job_type:
    | "trusted_reminder_delivery"
    | "contract_import_processing"
    | "webhook_dispatch"
    | "audit_event_flush"
    | "add_on_task";
  idempotency_key: string;
  payload: Record<string, unknown>;
};

export type GoWorkerJobResult = {
  accepted: boolean;
  job_id: string;
  status: "queued" | "duplicate" | "rejected";
  retry_after_seconds?: number;
};

function options(overrides: Partial<AddOnClientOptions> = {}): AddOnClientOptions {
  return {
    addOnId: "go_reliability_worker",
    baseUrl: overrides.baseUrl === undefined ? getAppConfig().addOns.goWorkerUrl : overrides.baseUrl,
    signingSecret: overrides.signingSecret === undefined ? getAppConfig().addOns.internalSigningSecret : overrides.signingSecret,
    ...overrides
  };
}

export function checkGoWorkerHealth(overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<never, AddOnHealthResponse>({ ...options(overrides), path: "/health", method: "GET" });
}

export function enqueueGoWorkerJob(request: GoWorkerJobRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<GoWorkerJobRequest, GoWorkerJobResult>({
    ...options(overrides),
    path: "/jobs",
    body: request
  });
}
