import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(projectRoot, path), "utf8");
}

describe("operational maturity boundaries", () => {
  it("keeps high-risk API routes on the shared route-handler pattern", () => {
    const standardizedRoutes = [
      "app/api/internal/health/route.ts",
      "app/api/internal/ocr-jobs/route.ts",
      "app/api/email-actions/[action]/[token]/route.ts",
      "app/api/cron/monthly-digest/route.ts",
      "app/api/webhooks/billing/paypal/route.ts",
      "app/api/webhooks/stripe/route.ts"
    ];

    for (const route of standardizedRoutes) {
      const source = readProjectFile(route);
      expect(source, route).toContain("createRouteHandler");
      expect(source, route).not.toContain("NextResponse.json");
    }
  });

  it("keeps scoped OCR file lookup tied to the queued job organization", () => {
    const source = readProjectFile("lib/ocr/jobs.ts");
    const helperStart = source.indexOf("export async function getScopedOcrContractFileForJob");
    const helperEnd = source.indexOf("export async function processPendingOcrJobs");
    const helper = source.slice(helperStart, helperEnd);

    expect(helper).toContain('.from("contracts")');
    expect(helper).toContain('.eq("id", input.contractId)');
    expect(helper).toContain('.eq("organization_id", input.organizationId)');
    expect(helper).toContain("input.contractFileId");
  });
});
