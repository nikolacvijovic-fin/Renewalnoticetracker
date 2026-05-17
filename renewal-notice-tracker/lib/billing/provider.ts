import type {
  BillingProvider,
  BillingProviderName,
  BillingProviderCapability,
  BillingCheckoutParams,
  BillingCheckoutSession,
  BillingManagementParams,
  BillingManagementSession,
  BillingWebhookParams,
  BillingWebhookResult
} from "@/lib/billing/types";
import { getBillingDefaultProvider, isBillingConfigured } from "@/lib/billing/config";
import { paddleProvider } from "@/lib/billing/providers/paddle";
import { getBillingProviderPolicy } from "@/lib/billing/provider-policy";

export function getBillingProvider(provider: BillingProviderName): BillingProvider {
  if (provider === "paddle") return paddleProvider;
  throw new Error("Legacy billing providers are not active in shipped-first runtime.");
}

export function resolveBillingProvider(
  billing: {
    billing_provider?: string | null;
    billing_customer_id?: string | null;
    billing_subscription_id?: string | null;
  },
  override?: BillingProviderName
): BillingProviderName {
  if (override === "paddle") return "paddle";
  if (billing.billing_provider === "paddle") return "paddle";
  return getBillingDefaultProvider();
}

export function getBillingProviderLabel(provider: BillingProviderName) {
  return getBillingProviderPolicy(provider).label;
}

export function getBillingProviderCapability(provider: BillingProviderName): BillingProviderCapability {
  const policy = getBillingProviderPolicy(provider);

  if (!policy.checkoutSupported || !policy.managementSupported) {
    return {
      checkout: {
        supported: false,
        message: policy.customerMessage
      },
      management: {
        supported: false,
        message: policy.customerMessage
      }
    };
  }

  const configured = isBillingConfigured("paddle");
  return {
    checkout: {
      supported: configured,
      message: configured
        ? "Paddle is the default recurring billing provider."
        : "Paddle billing is not configured in this environment."
    },
    management: {
      supported: configured,
      message: configured
        ? "Paddle provides self-serve subscription management."
        : "Paddle billing is not configured in this environment."
    }
  };
}

export async function createCheckoutSession(
  params: BillingCheckoutParams
): Promise<BillingCheckoutSession> {
  const providerName = resolveBillingProvider(
    {
      billing_provider: null,
      billing_customer_id: params.existingCustomerId
    },
    params.providerOverride
  );
  const provider = getBillingProvider(providerName);

  if (!isBillingConfigured(providerName)) {
    throw new Error(`Billing provider ${providerName} is not configured.`);
  }

  return provider.createCheckoutSession({
    ...params,
    providerOverride: providerName
  });
}

export async function createCustomerManagementSession(
  params: BillingManagementParams
): Promise<BillingManagementSession> {
  const providerName = params.providerOverride ?? getBillingDefaultProvider();
  const provider = getBillingProvider(providerName);

  if (!isBillingConfigured(providerName)) {
    return {
      provider: providerName,
      supported: false,
      reason: "Billing provider is not configured."
    };
  }

  return provider.createManagementSession(params);
}

export async function handleWebhook(
  provider: BillingProviderName,
  params: BillingWebhookParams
): Promise<BillingWebhookResult> {
  if (provider !== "paddle") {
    throw new Error("Legacy billing webhooks are disabled in shipped-first runtime.");
  }
  const handler = getBillingProvider(provider);
  return handler.handleWebhook(params);
}
