import { env } from "@/lib/env";
import type { BillingProviderName } from "@/lib/billing/types";

const paddleEnvironments = new Set(["sandbox", "production"]);

export function getBillingDefaultProvider(): BillingProviderName {
  return "paddle";
}

export function getBillingReturnUrls() {
  const baseUrl = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  return {
    successUrl: `${baseUrl}/dashboard/settings`,
    cancelUrl: `${baseUrl}/pricing`,
    manageReturnUrl: `${baseUrl}/dashboard/settings`
  };
}

export function getPaddleConfig() {
  const apiKey = env.PADDLE_API_KEY;
  const webhookSecret = env.PADDLE_WEBHOOK_SECRET;
  const environment = env.PADDLE_ENVIRONMENT ?? "sandbox";
  const starterPriceId = env.PADDLE_STARTER_PRICE_ID;
  const growthPriceId = env.PADDLE_GROWTH_PRICE_ID;

  if (!apiKey || !webhookSecret || !starterPriceId || !growthPriceId) {
    throw new Error("Missing Paddle billing configuration env vars.");
  }

  if (!paddleEnvironments.has(environment)) {
    throw new Error("Invalid Paddle environment.");
  }

  const envValue = environment as "sandbox" | "production";
  const apiBaseUrl = envValue === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";

  return {
    apiKey,
    webhookSecret,
    environment: envValue,
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
