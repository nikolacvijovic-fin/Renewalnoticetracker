import fs from "node:fs";
import path from "node:path";
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
});
