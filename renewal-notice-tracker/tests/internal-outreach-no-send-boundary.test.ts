import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SHIPPED_FIRST_SCOPE } from "@/lib/product/shipping-profile";

const outreachFiles = [
  "lib/internal-outreach-intelligence/internal-outreach-intelligence.ts",
  "lib/internal-outreach-intelligence/crm-note-builder.ts",
  "lib/internal-outreach-intelligence/outreach-audience-resolver.ts",
  "lib/internal-outreach-intelligence/outreach-draft-generator.ts",
  "lib/internal-outreach-intelligence/cold-outreach-types.ts",
  "lib/internal-outreach-intelligence/cold-outreach-workbench.ts",
  "lib/internal-outreach-intelligence/cold-outreach-crm-types.ts",
  "lib/internal-outreach-intelligence/cold-outreach-crm.ts",
  "lib/internal-outreach-intelligence/outreach-opportunity-detector.ts",
  "lib/internal-outreach-intelligence/outreach-prioritization.ts",
  "lib/internal-outreach-intelligence/outreach-sequence-planner.ts",
  "lib/actions/internal-outreach-intelligence.ts",
  "components/internal-outreach/internal-outreach-panel.tsx"
] as const;

describe("internal outreach no-send boundary", () => {
  it("does not import external delivery providers or define send routes", () => {
    for (const file of outreachFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const label = relative(process.cwd(), join(process.cwd(), file));

      expect(source, label).not.toMatch(/from\s+["']resend["']/i);
      expect(source, label).not.toMatch(/sendgrid|mailgun|postmark|smtp/i);
      expect(source, label).not.toMatch(/fetch\(/);
      expect(source, label).not.toMatch(/send[A-Z]?(Email|Message|Outreach|Draft)/);
      expect(source, label).not.toMatch(/deliver[A-Z]?(Email|Message|Outreach|Draft)/);
    }
  });

  it("ships only internal draft intelligence while external cold outreach remains non-runtime", () => {
    expect(SHIPPED_FIRST_SCOPE.shippedFirstFeatures).toContain("internal_outreach_draft_intelligence");
    expect(SHIPPED_FIRST_SCOPE.deferredFeatures).toContain("external_cold_outreach_delivery");
    expect(SHIPPED_FIRST_SCOPE.shippedFirstFeatures).not.toContain("external_cold_outreach_delivery");
    expect(SHIPPED_FIRST_SCOPE.permanentlyExcludedFeatures).toContain("crm_orchestration");
  });
});
