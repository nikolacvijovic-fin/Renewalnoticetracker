import taxonomy from "@/config/subscription-capability-taxonomy.v1.json";

export const SUBSCRIPTION_CAPABILITY_TAXONOMY_VERSION = taxonomy.version;
export const SUBSCRIPTION_CAPABILITIES = taxonomy.capabilities;
export const SUBSCRIPTION_CAPABILITY_MAPPINGS = taxonomy.products;

export type SubscriptionCapability = (typeof SUBSCRIPTION_CAPABILITIES)[number];
export type SubscriptionUsageProvider = "manual_csv" | "microsoft_365" | "google_workspace";

export function getProductCapabilities(provider: SubscriptionUsageProvider, product: string) {
  const normalized = product.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return SUBSCRIPTION_CAPABILITY_MAPPINGS.filter(
    (mapping) =>
      mapping.provider === provider &&
      mapping.patterns.some((pattern) => normalized.includes(pattern))
  ).flatMap((mapping) =>
    mapping.capabilities.map((capability) => ({
      capability,
      mappingSpecificity: mapping.mappingSpecificity
    }))
  );
}
