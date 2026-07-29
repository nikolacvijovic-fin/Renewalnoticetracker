import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryPath = "lib/commercial-decision-workbench/repositories/admin-commercial-decision-repository.ts";
const repository = readFileSync(join(process.cwd(), repositoryPath), "utf8");

describe("commercial decision admin repository", () => {
  it("keeps privileged access behind the approved repository boundary", () => {
    expect(repository).toContain('import { createAdminSupabaseClient } from "@/lib/supabase/admin"');
    expect(repository).not.toContain("export function admin");
    expect(repository).not.toContain("export async function admin");
  });

  it("requires organization scope on every read and mutation helper", () => {
    const exportedFunctions = [...repository.matchAll(/export (?:async )?function (\w+)/g)].map((match) => match[1]);

    expect(exportedFunctions).toEqual(
      expect.arrayContaining([
        "insertAdminCommercialDecision",
        "getAdminCommercialDecisionById",
        "getAdminActiveCommercialDecisionByContractId",
        "listAdminCommercialDecisions",
        "updateAdminCommercialDecision",
        "updateAdminCommercialDecisionStatus",
        "insertAdminCommercialDecisionEvidenceLink",
        "upsertAdminCommercialDecisionEvidenceLink",
        "insertAdminCommercialDecisionApprovalStep",
        "updateAdminCommercialDecisionApprovalStep",
        "insertAdminCommercialDecisionSnapshot",
        "listAdminCommercialDecisionEvidenceLinks",
        "listAdminCommercialDecisionApprovalSteps",
        "listAdminCommercialDecisionSnapshots"
      ])
    );

    for (const functionName of exportedFunctions) {
      const start = repository.indexOf(`function ${functionName}`);
      const endCandidates = exportedFunctions
        .map((name) => repository.indexOf(`function ${name}`, start + 1))
        .filter((index) => index > start);
      const end = endCandidates.length ? Math.min(...endCandidates) : repository.length;
      const body = repository.slice(start, end);
      expect(body, `${functionName} should accept organizationId`).toContain("organizationId");
      if (body.includes(".from(")) {
        expect(body, `${functionName} should write or filter by organization_id`).toContain("organization_id");
      } else {
        expect(body, `${functionName} should delegate to the scoped update helper`).toContain("updateAdminCommercialDecision(input)");
      }
    }
  });

  it("does not expose archived decisions as the active contract decision", () => {
    expect(repository).toContain('.neq("decision_status", "archived")');
  });

  it("uses compare-and-set status updates and idempotent evidence refresh", () => {
    expect(repository).toContain("expectedStatus");
    expect(repository).toContain('.eq("decision_status", input.expectedStatus)');
    expect(repository).toContain("upsertAdminCommercialDecisionEvidenceLink");
    expect(repository).toContain(".maybeSingle()");
    expect(repository).toContain('.eq("decision_id", input.decisionId)');
  });
});
