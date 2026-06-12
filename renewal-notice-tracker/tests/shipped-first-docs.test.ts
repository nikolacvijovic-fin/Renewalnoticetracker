import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

  it("keeps the billing smoke checklist on Paddle and manual invoice only", () => {
    const checklist = readRepoFile("tests", "billing-commercial-smoke-checklist.md");

    expect(checklist).toContain("Paddle");
    expect(checklist).toContain("manual invoice");
    expect(checklist).toContain("does not mention monthly digest, Slack, Teams, or provider parity");
    expect(checklist).not.toContain("PayPal orgs show");
    expect(checklist).not.toContain("legacy Stripe orgs can still use management");
  });
});
