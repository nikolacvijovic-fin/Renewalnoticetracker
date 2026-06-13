import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BILLING_PROVIDER_POLICY } from "@/lib/billing/provider-policy";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("shipped-first docs", () => {
  it("keeps the public README aligned with shipped-first runtime", () => {
    const readme = readRepoFile("README.md");

    expect(readme).toContain("Paddle");
    expect(readme).toContain("docs/CURRENT_PRODUCT_TRUTH.md");
    expect(readme).toContain("docs/reference");
    expect(readme).not.toContain("Provider-neutral billing");
    expect(readme).not.toContain("PayPal optional");
    expect(readme).not.toContain("protected admin tooling");
  });

  it("keeps deferred breadth classified outside the current runtime", () => {
    const notShipped = readRepoFile("NOT_SHIPPED_FIRST.md");
    const deferred = readRepoFile("DEFERRED_CAPABILITIES.md");
    const shippedKernel = readRepoFile("SHIPPED_KERNEL.md");
    const futureIndex = readRepoFile("docs", "FUTURE_REFERENCE_INDEX.md");

    expect(notShipped).toContain("monthly digest");
    expect(notShipped).toContain("Slack and Teams delivery");
    expect(notShipped).toContain("PayPal");
    expect(notShipped).toContain("Stripe");
    expect(deferred).toContain("playbooks");
    expect(deferred).toContain("custom reminder rules");
    expect(futureIndex).toContain("reference/future");
    expect(shippedKernel).toContain("must not import deferred modules");
  });

  it("keeps the billing smoke checklist on Paddle plus support-led exceptions only", () => {
    const checklist = readRepoFile("tests", "billing-commercial-smoke-checklist.md");

    expect(checklist).toContain("Paddle");
    expect(checklist).toContain("manual invoice");
    expect(checklist).toContain("PayPal support-led exception");
    expect(checklist).toContain("does not mention monthly digest, Slack, Teams, or provider parity");
    expect(checklist).not.toContain("legacy Stripe orgs can still use management");
  });

  it("keeps billing provider docs aligned with the provider registry", () => {
    const billingDocs = [
      readRepoFile("README.md"),
      readRepoFile("tests", "billing-commercial-smoke-checklist.md"),
      readRepoFile("docs", "reference", "legacy", "MIGRATION_BILLING.md")
    ].join("\n");

    expect(BILLING_PROVIDER_POLICY.paddle.state).toBe("active_self_serve");
    expect(BILLING_PROVIDER_POLICY.manual.state).toBe("support_led_exception");
    expect(BILLING_PROVIDER_POLICY.paypal.state).toBe("support_led_exception");
    expect(BILLING_PROVIDER_POLICY.stripe.state).toBe("legacy_migration_only");

    expect(billingDocs).toContain("Paddle as the only self-serve billing provider");
    expect(billingDocs).toContain("manual invoice / wire transfer");
    expect(billingDocs).toContain("PayPal support-led exception");
    expect(billingDocs).toContain("Stripe");
    expect(billingDocs).toContain("migration-only");
  });
});
