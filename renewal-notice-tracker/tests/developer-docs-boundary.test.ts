import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("developer documentation boundaries", () => {
  it("keeps the contributor guide practical for high-risk product changes", () => {
    const guide = readRepoFile("CONTRIBUTING.md");

    for (const required of [
      "npm run typecheck",
      "npm run test:release-critical",
      "npm run test:intelligence-release-gate",
      "npm run e2e",
      "Adding A New API Route Safely",
      "Adding A New Export Preset Safely",
      "Adding A New Intelligence Surface Safely",
      "Adding A Billing-Gated Feature Safely",
      "Adding A Database Query Or Helper Safely",
      "Updating Shipped And Deferred Boundaries"
    ]) {
      expect(guide).toContain(required);
    }

    expect(guide).toContain("Do not commit real secrets");
  });

  it("documents where product truth belongs before pages become rule engines", () => {
    const architecture = readRepoFile("docs", "ARCHITECTURE_BOUNDARIES.md");

    for (const required of [
      "Shipped Kernel",
      "Deferred Capabilities",
      "Where Product Truth Lives",
      "Export And Reporting",
      "Intelligence",
      "Audit, Analytics, Logs, Monitoring",
      "Component Organization Notes"
    ]) {
      expect(architecture).toContain(required);
    }

    expect(architecture).toContain("full CLM workflows");
    expect(architecture).toContain("Notes and intelligence never appear in the default basic export");
  });

  it("keeps a short maintainability risk register for future contributors", () => {
    const risks = readRepoFile("docs", "MAINTAINABILITY_RISKS.md");

    for (const required of [
      "Most Fragile Areas",
      "Highest-Value Future Refactors",
      "Areas To Avoid Expanding Too Early",
      "Tests To Add Next",
      "Docs To Keep In Sync"
    ]) {
      expect(risks).toContain(required);
    }

    expect(risks).toContain("Slack/Teams delivery");
    expect(risks).toContain("full CLM lifecycle");
  });

  it("documents synchronous scale limits, export thresholds, and index recommendations", () => {
    const scale = readRepoFile("docs", "SCALE_AND_PERFORMANCE.md");

    for (const required of [
      "5000",
      "ERR_EXPORT_TOO_LARGE_001",
      "Basic Contract Register fetches only contract/register metadata",
      "Notes & Decisions Export is the only selectable preset that fetches notes",
      "contracts(organization_id, updated_at desc)",
      "notes(contract_id, created_at desc)",
      "audit_logs(organization_id, entity_type, created_at desc)",
      "Background exports become necessary"
    ]) {
      expect(scale).toContain(required);
    }
  });
});
