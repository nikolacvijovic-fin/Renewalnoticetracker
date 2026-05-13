import { z } from "zod";
import { getBillingReturnUrls } from "@/lib/billing/config";

const paypalEnvironmentSchema = z.enum(["sandbox", "live"]);

const payPalEnvSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  PAYPAL_ENVIRONMENT: paypalEnvironmentSchema.default("sandbox"),
  PAYPAL_STARTER_PLAN_ID: z.string().min(1),
  PAYPAL_GROWTH_PLAN_ID: z.string().min(1)
});

const stripeEnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_STARTER_PRICE_ID: z.string().min(1),
  STRIPE_GROWTH_PRICE_ID: z.string().min(1)
});

export { getBillingReturnUrls };

export function getPayPalConfig() {
  const config = payPalEnvSchema.parse(process.env);
  const apiBaseUrl =
    config.PAYPAL_ENVIRONMENT === "sandbox"
      ? "https://api-m.sandbox.paypal.com"
      : "https://api-m.paypal.com";

  return {
    clientId: config.PAYPAL_CLIENT_ID,
    clientSecret: config.PAYPAL_CLIENT_SECRET,
    webhookId: config.PAYPAL_WEBHOOK_ID,
    environment: config.PAYPAL_ENVIRONMENT,
    apiBaseUrl,
    starterPlanId: config.PAYPAL_STARTER_PLAN_ID,
    growthPlanId: config.PAYPAL_GROWTH_PLAN_ID
  };
}

export function getStripeLegacyConfig() {
  const config = stripeEnvSchema.parse(process.env);
  return {
    secretKey: config.STRIPE_SECRET_KEY,
    webhookSecret: config.STRIPE_WEBHOOK_SECRET,
    starterPriceId: config.STRIPE_STARTER_PRICE_ID,
    growthPriceId: config.STRIPE_GROWTH_PRICE_ID
  };
}
