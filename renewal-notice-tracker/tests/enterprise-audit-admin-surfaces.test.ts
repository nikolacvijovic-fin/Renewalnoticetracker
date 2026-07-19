import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function readRepoFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("enterprise audit admin surfaces", () => {
  it("keeps the audit page internal-only and explicit-org scoped", () => {
    const source = readRepoFile("app/admin/audit/page.tsx");

    expect(source).toContain("requireInternalRole");
    expect(source).toContain("organizationId");
    expect(source).toContain("getEnterpriseAuditEvents");
    expect(source).not.toMatch(/raw_contract_text|provider_payload|storage_path/);
  });

  it("keeps readiness scoring internal-only and explicit-org scoped", () => {
    const source = readRepoFile("app/admin/enterprise-readiness/page.tsx");

    expect(source).toContain("requireInternalRole");
    expect(source).toContain("organizationId");
    expect(source).toContain("computeEnterpriseReadinessScore");
  });

  it("wires contract detail to the normalized enterprise audit timeline", () => {
    const source = readRepoFile("app/dashboard/contracts/[id]/page.tsx");

    expect(source).toContain("getContractAuditTimeline");
    expect(source).toContain("ContractEnterpriseAuditTimeline");
    expect(source).toContain("Enterprise trust timeline");
  });
});
