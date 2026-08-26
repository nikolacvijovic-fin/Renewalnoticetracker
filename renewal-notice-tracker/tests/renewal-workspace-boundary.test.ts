import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...segments: string[]) => readFileSync(join(process.cwd(), ...segments), "utf8");

describe("renewal workspace runtime boundary", () => {
  it("requires org, product action, and contract scope before workspace mutations", () => {
    const action = read("lib", "actions", "renewal-workspace.ts");
    expect(action).toContain("requireOrganization()");
    expect(action).toContain('capability: "manage_renewal_decision"');
    expect(action).toContain('capability: "confirm_financial_outcome"');
    expect(action).not.toContain('assertCanUseShippedAction(context, "review_p0")');
    expect(action).toContain("requireScopedContract(input.contractId, context.organizationId)");
    expect(action).toContain("workbench.decision.id !== input.decisionId");
    expect(action).toContain("decision_owner_must_be_an_active_organization_member");
    expect(action).toContain("task_owner_must_be_an_active_organization_member");
  });

  it("contains no automatic vendor delivery or license-changing path", () => {
    const files = [
      read("lib", "actions", "renewal-workspace.ts"),
      read("lib", "renewal-workspace", "renewal-workspace-service.ts"),
      read("components", "renewal-workspace", "renewal-workspace-extension-panel.tsx")
    ].join("\n");
    expect(files).not.toMatch(/sendEmail|provider\.send|cancelSubscription|purchaseLicense|removeLicense/);
    expect(files).toContain("NoticeControl never sends, cancels, purchases, or changes licenses");
  });

  it("exposes the workspace on contract detail and a separate portfolio route", () => {
    const contractPage = read("app", "dashboard", "contracts", "[id]", "commercial-decision", "page.tsx");
    const portfolioPage = read("app", "dashboard", "renewal-workspace", "page.tsx");
    expect(contractPage).toContain("RenewalWorkspaceExtensionPanel");
    expect(portfolioPage).toContain("Decision and negotiation pipeline");
    expect(portfolioPage).toContain("Confirmed savings");
  });
});
