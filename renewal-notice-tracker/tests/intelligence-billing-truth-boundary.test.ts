import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const INTELLIGENCE_SURFACE_FILES = [
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\dashboard\\contracts\\[id]\\page.tsx",
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\dashboard\\contracts\\page.tsx",
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\dashboard\\risk-queue\\page.tsx",
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\dashboard\\financial-intelligence\\page.tsx",
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\dashboard\\procurement-analytics\\page.tsx",
  "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\app\\api\\intelligence\\risk\\contracts\\[id]\\explanation-view\\route.ts"
] as const;

describe("intelligence billing truth boundary", () => {
  it("keeps intelligence surfaces off raw or page-local billing snapshot assembly", () => {
    for (const file of INTELLIGENCE_SURFACE_FILES) {
      const content = readFileSync(file, "utf8");

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
      "C:\\Users\\Lenovo\\Documents\\Playground\\renewal-notice-tracker\\lib\\intelligence\\access.ts",
      "utf8"
    );

    expect(accessHelper).toContain('from "@/lib/billing/entitlements"');
    expect(accessHelper).toContain("getBillingSnapshot");
    expect(accessHelper).toContain("getIntelligenceSurfaceAccessState");
    expect(accessHelper).toContain("getIntelligenceSurfaceAccessMap");
  });
});
