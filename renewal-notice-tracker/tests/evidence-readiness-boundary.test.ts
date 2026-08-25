import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => fs.readFileSync(path.join(root, ...parts), "utf8");

describe("evidence readiness runtime boundary", () => {
  it("keeps source assembly and persistence organization scoped", () => {
    const repository = read("lib", "evidence-readiness", "repositories", "admin-evidence-readiness-repository.ts");
    expect(repository).toContain('.eq("organization_id", input.organizationId)');
    expect(repository).toContain('.eq("contract_id", input.contractId)');
    expect(repository).toContain('p_organization_id: assessment.organizationId');
    expect(repository).toContain('p_contract_id: assessment.contractId');
    expect(repository).not.toMatch(/\.select\("\*"\)\.limit/);
  });

  it("does not expose a manual readiness verification action to ordinary members", () => {
    const actions = read("lib", "actions", "renewal-workspace.ts");
    const migration = read("supabase", "migrations", "202608240003_evidence_completeness_score.sql");
    expect(actions).not.toMatch(/verifyEvidence|markEvidenceVerified|overrideReadiness/);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("keeps customer copy honest and raw evidence out of the score UI", () => {
    const panel = read("components", "renewal-workspace", "evidence-readiness-panel.tsx");
    expect(panel).toContain("not legal advice");
    expect(panel).toContain("A high score cannot override a critical blocker");
    expect(panel).not.toMatch(/raw contract text|provider payload|quote contents|ocr output/i);
  });

  it("wires deterministic recalculation to material source changes", () => {
    const review = read("lib", "actions", "contracts", "legacy.ts");
    const quote = read("lib", "actions", "contracts", "quote-comparison.ts");
    const usage = read("lib", "actions", "subscription-usage-optimization.ts");
    const scheduled = read("lib", "subscription-usage", "scheduled-sync.ts");
    const decision = read("lib", "actions", "renewal-workspace.ts");
    const commercialDecision = read("lib", "actions", "commercial-decision-workbench.ts");
    for (const source of [review, quote, usage, scheduled, decision, commercialDecision]) {
      expect(source).toContain("recalculateEvidenceReadiness");
    }
  });
});
