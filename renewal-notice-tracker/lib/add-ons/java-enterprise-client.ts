import { callAddOnJson, type AddOnClientOptions, type AddOnHealthResponse } from "@/lib/add-ons/client-core";
import { getAppConfig } from "@/lib/config";

export type EnterpriseConnectorRequest = {
  organization_id: string;
  connector_type: "procurement" | "identity" | "approval_workflow" | "compliance_export";
  operation: string;
  payload: Record<string, unknown>;
};

export type EnterpriseConnectorResult = {
  accepted: boolean;
  connector_type: EnterpriseConnectorRequest["connector_type"];
  external_reference_id: string | null;
  warnings: string[];
};

function options(overrides: Partial<AddOnClientOptions> = {}): AddOnClientOptions {
  return {
    addOnId: "java_enterprise_connectors",
    baseUrl: overrides.baseUrl === undefined ? getAppConfig().addOns.javaEnterpriseConnectorsUrl : overrides.baseUrl,
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
