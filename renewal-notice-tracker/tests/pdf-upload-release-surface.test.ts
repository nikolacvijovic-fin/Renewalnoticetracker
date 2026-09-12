import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("PDF upload release surface", () => {
  it("links the Opt-Out Clock to the authenticated PDF workbench", () => {
    const clock = read("app/dashboard/saas-opt-out-clock/page.tsx");
    const uploadPage = read("app/dashboard/saas-opt-out-clock/pdf-upload/page.tsx");

    expect(clock).toContain('href="/dashboard/saas-opt-out-clock/pdf-upload"');
    expect(uploadPage).toContain("requireOrganization()");
    expect(uploadPage).toContain("getOrganizationMembers(context.organizationId)");
    expect(uploadPage).toContain("getOrganizationContractCount(context.organizationId)");
    expect(uploadPage).toMatch(/human review/i);
  });

  it("refreshes the clock after persistence and preserves review-state truth", () => {
    const action = read("lib/actions/contracts/legacy.ts");
    const workbench = read("components/saas/pdf-upload-workbench.tsx");

    expect(action).toContain('revalidatePath("/dashboard/saas-opt-out-clock")');
    expect(action).toContain('extractionStatus: finalStatus');
    expect(action).toContain("needsReview: true");
    expect(workbench).toContain("router.refresh()");
    expect(workbench).toContain("Review contract");
    expect(workbench).not.toMatch(/provider payload|service role key|raw contract text/i);
  });

  it("ships a clear, optimized homepage hero asset", () => {
    const homepage = read("app/page.tsx");
    const assetPath = path.join(root, "public/images/noticecontrol-opt-out-clock-hero.png");

    expect(homepage).toContain('src="/images/noticecontrol-opt-out-clock-hero.png"');
    expect(homepage).toContain("priority");
    expect(homepage).toContain("Stop surprise auto-renewals");
    expect(fs.statSync(assetPath).size).toBeGreaterThan(100_000);
  });

  it("has a required authenticated SaaS PDF browser acceptance boundary", () => {
    const runner = read("scripts/run-saas-pdf-e2e.mjs");
    const spec = read("e2e/saas-pdf-opt-out-clock.spec.ts");

    expect(runner).toContain("E2E_SECONDARY_AUTH_COOKIE_VALUE");
    expect(runner).toContain("--required");
    expect(spec).toContain('extractionStatus: "processing"');
    expect(spec).toContain("sessionStorage");
    expect(spec).toContain("Save review");
    expect(spec).toContain("activate for opt-out clock");
    expect(spec).toContain("toHaveCount(1)");
    expect(spec).toContain("noticecontrol-saas-opt-out-deadlines.ics");
    expect(spec).toContain("cache-control");
    expect(spec).toContain("sensitiveConsoleMessages");
  });

  it("generates a deterministic synthetic SaaS PDF fixture without customer data", () => {
    const fixturePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "noticecontrol-pdf-fixture-")), "fixture.pdf");
    const result = spawnSync(process.execPath, ["scripts/synthetic-saas-pdf-fixture.mjs", fixturePath], {
      cwd: root,
      encoding: "utf8"
    });
    const fixtureSource = read("scripts/synthetic-saas-pdf-fixture.mjs");

    expect(result.status).toBe(0);
    expect(fs.readFileSync(fixturePath).subarray(0, 4).toString()).toBe("%PDF");
    expect(fixtureSource).toContain("December 31, 2027");
    expect(fixtureSource).toContain("30 days before renewal");
    expect(fixtureSource).toContain("no customer or production data");
  });
});
