import { callAddOnJson, type AddOnClientOptions, type AddOnHealthResponse } from "@/lib/add-ons/client-core";
import { getAppConfig } from "@/lib/config";

export type EnterpriseConnectorRequest = {
  organization_id: string;
  connector_type: "procurement" | "identity" | "approval_workflow" | "compliance_export" | "subscription_usage";
  operation: string;
  payload: Record<string, unknown>;
};

export type EnterpriseConnectorResult = {
  accepted: boolean;
  connector_type: EnterpriseConnectorRequest["connector_type"];
  external_reference_id: string | null;
  warnings: string[];
};

export type UsageInventoryConnectorRequest = {
  organization_id: string;
  connector_type: "subscription_usage";
  provider?: "microsoft_365" | "google_workspace";
  tenant_id?: string | null;
  customer_id?: string | null;
  domain?: string | null;
  credential_reference: string;
  provider_access_token?: string | null;
  cursor?: string | null;
  page_size: number;
  idempotency_key: string;
};

export type UsageInventoryConnectorResult = {
  accepted: boolean;
  connector_type: "subscription_usage";
  records: Array<{
    external_product_id: string;
    vendor: string;
    product: string;
    category?: string | null;
    purchased_seats: number;
    assigned_seats: number;
    active_users_30d: number;
    active_users_90d: number;
    last_activity_at?: string | null;
    collected_at: string;
    source_label: string;
    warning_codes?: string[];
  }>;
  next_cursor: string | null;
  warnings: string[];
  retry_count?: number;
  partial?: boolean;
};

function options(overrides: Partial<AddOnClientOptions> = {}): AddOnClientOptions {
  return {
    addOnId: "java_enterprise_connectors",
    baseUrl: overrides.baseUrl === undefined ? getAppConfig().addOns.javaEnterpriseConnectorsUrl : overrides.baseUrl,
    signingSecret: overrides.signingSecret === undefined ? getAppConfig().addOns.internalSigningSecret : overrides.signingSecret,
    ...overrides
  };
}

export function checkJavaEnterpriseHealth(overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<never, AddOnHealthResponse>({ ...options(overrides), path: "/health", method: "GET" });
}

export function executeEnterpriseConnector(request: EnterpriseConnectorRequest, overrides?: Partial<AddOnClientOptions>) {
  return callAddOnJson<EnterpriseConnectorRequest, EnterpriseConnectorResult>({
    ...options(overrides),
    path: "/connectors/execute",
    body: request
  });
}

export function fetchUsageInventorySnapshot(
  request: UsageInventoryConnectorRequest,
  overrides?: Partial<AddOnClientOptions>
) {
  return callAddOnJson<UsageInventoryConnectorRequest, UsageInventoryConnectorResult>({
    ...options(overrides),
    path: "/connectors/subscription-usage/snapshot",
    body: request
  });
}
