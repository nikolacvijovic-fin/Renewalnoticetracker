import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFERRED_CAPABILITIES } from "@/lib/product/deferred-capabilities";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("deferred capability registry", () => {
  it("tracks the known shipped-first deferred capabilities", () => {
    const slugs = new Set(DEFERRED_CAPABILITIES.map((item) => item.slug));

    for (const slug of [
      "playbooks",
      "custom_reminder_rules",
      "retention_health_surfaces",
      "monthly_digest",
      "paypal_billing",
      "stripe_billing",
      "full_clm_expansion"
    ]) {
      expect(slugs.has(slug)).toBe(true);
    }
  });

  it("uses only supported runtime surface labels", () => {
    for (const capability of DEFERRED_CAPABILITIES) {
      expect(["none", "internal_only", "migration_only"]).toContain(
        capability.allowedRuntimeSurface
      );
      expect(capability.activationRequirements.length).toBeGreaterThan(0);
    }
  });

  it("points preserved module paths at real repo files when declared", () => {
    for (const capability of DEFERRED_CAPABILITIES) {
      for (const modulePath of capability.modulePaths ?? []) {
        expect(fs.existsSync(path.join(repoRoot, modulePath))).toBe(true);
      }
    }
  });
});
