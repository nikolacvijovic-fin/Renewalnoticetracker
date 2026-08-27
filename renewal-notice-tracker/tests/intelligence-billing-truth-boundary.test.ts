import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const INTELLIGENCE_SURFACE_FILES = [
  "app/dashboard/contracts/[id]/page.tsx",
  "app/dashboard/contracts/page.tsx",
  "app/dashboard/risk-queue/page.tsx",
  "app/dashboard/financial-intelligence/page.tsx",
  "app/dashboard/procurement-analytics/page.tsx",
  "app/api/intelligence/risk/contracts/[id]/explanation-view/route.ts"
] as const;

describe("intelligence billing truth boundary", () => {
  it("keeps intelligence surfaces off raw or page-local billing snapshot assembly", () => {
    for (const file of INTELLIGENCE_SURFACE_FILES) {
      const content = readFileSync(resolve(REPOSITORY_ROOT, file), "utf8");

      expect(content, `${file} should not import raw organization billing for intelligence gating`).not.toContain(
        "getOrganizationBilling"
      );
      expect(content, `${file} should not locally normalize intelligence billing truth`).not.toContain(
        "normalizeBillingSnapshot"
      );
    }
  });

  it("routes intelligence gating through the canonical shared billing snapshot path", () => {
    const accessHelper = readFileSync(
      resolve(REPOSITORY_ROOT, "lib/intelligence/access.ts"),
      "utf8"
    );

    expect(accessHelper).toContain('from "@/lib/billing/entitlements"');
    expect(accessHelper).toContain("getBillingSnapshot");
    expect(accessHelper).toContain("getIntelligenceSurfaceAccessState");
    expect(accessHelper).toContain("getIntelligenceSurfaceAccessMap");
  });
});
