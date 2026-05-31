import { getAppConfig } from "@/lib/config";
import type { BillingProviderName } from "@/lib/billing/types";

export function getBillingDefaultProvider(): BillingProviderName {
  return "paddle";
}

export function getBillingReturnUrls() {
  const baseUrl = getAppConfig().public.appUrl.replace(/\/$/, "");
  return {
    successUrl: `${baseUrl}/dashboard/settings`,
    cancelUrl: `${baseUrl}/pricing`,
    manageReturnUrl: `${baseUrl}/dashboard/settings`
  };
}

export function getPaddleConfig() {
  const {
    paddleApiKey: apiKey,
    paddleWebhookSecret: webhookSecret,
    paddleEnvironment: environment,
    paddleStarterPriceId: starterPriceId,
    paddleGrowthPriceId: growthPriceId
  } = getAppConfig().billing;

  if (!apiKey || !webhookSecret || !starterPriceId || !growthPriceId) {
    throw new Error("Missing Paddle billing configuration env vars.");
  }

  const apiBaseUrl = environment === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

  return {
    apiKey,
    webhookSecret,
    environment,
    apiBaseUrl,
    starterPriceId,
    growthPriceId
  };
}

export function isBillingConfigured(provider: BillingProviderName) {
  try {
    if (provider === "manual") return true;
    if (provider !== "paddle") return false;
    getPaddleConfig();
    return true;
  } catch {
    return false;
  }
}
