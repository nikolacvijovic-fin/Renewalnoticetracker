import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aiFactDecisionCandidate, normalizeAiProposedFact } from "@/lib/ai/ai-fact-normalizer";
import { applyDecisionLifecycleAction, canMutateDecision } from "@/lib/decision-intelligence/decision-actions";
import { createDecisionRecord, decisionCandidateFromRuleOutcome } from "@/lib/decision-intelligence/decision-records";
import { applyDecisionCandidates } from "@/lib/decision-intelligence/decision-repository";
import { evaluateSaasRenewalDecisionCandidates, saasRenewalRuleMetadata } from "@/lib/rules/saas-renewal-rules";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function baseDecision() {
  return createDecisionRecord({
    organizationId: "org-1",
    entityType: "contract",
    entityId: "00000000-0000-4000-8000-000000000001",
    decisionType: "blocker",
    title: "Weak evidence requires review",
    summary: "Renewal-control evidence is weak.",
    severity: "high",
    source: "rule",
    ruleId: "weak_evidence",
    aiFactId: null,
    confidence: 0.4,
    trustStatus: "blocked",
    evidenceRefs: [{ code: "evidence_confidence", source: "system_rule", value: 0.4 }],
    allowedActions: ["review_evidence", "acknowledge", "resolve"],
    blockedReason: "Evidence must be reviewed.",
    ownerUserId: "owner-1",
    dueAt: null,
    metadata: {
      privateNoteText: "private note should not survive",
      safeCount: 1
    }
  }, "2026-08-02T10:00:00.000Z");
}

describe("Enterprise Decision Intelligence v2", () => {
  it("creates safe decision records from rule outcomes", () => {
    const decision = createDecisionRecord(decisionCandidateFromRuleOutcome({
      organizationId: "org-1",
      entityType: "saas_contract_term",
      entityId: "term-1",
      outcome: {
        ruleId: "metadata_conflict",
        outcomeType: "blocker",
        code: "metadata_conflict",
        severity: "high",
        message: "Controlled SaaS and contract metadata disagree.",
        recommendedAction: "Record a trusted overlay decision.",
        evidence: [
          { code: "metadata_conflict_count", value: 2, source: "system_rule" }
        ]
      }
    }), "2026-08-02T10:00:00.000Z");

    expect(decision).toEqual(expect.objectContaining({
      organizationId: "org-1",
      decisionType: "blocker",
      status: "open",
      source: "rule",
      ruleId: "metadata_conflict",
      trustStatus: "conflicted"
    }));
    expect(JSON.stringify(decision)).not.toMatch(/raw contract|private note|provider payload|email body/i);
  });

  it("dedupes unchanged decisions and supersedes stale decisions when source facts change", () => {
    const candidate = {
      organizationId: "org-1",
      entityType: "contract",
      entityId: "contract-1",
      decisionType: "blocker" as const,
      title: "Missing owner",
      summary: "No accountable owner is assigned.",
      severity: "medium" as const,
      source: "rule" as const,
      ruleId: "missing_owner",
      aiFactId: null,
      confidence: null,
      trustStatus: "blocked" as const,
      evidenceRefs: [{ code: "owner_missing", source: "system_rule" as const }],
      allowedActions: ["assign_owner" as const],
      blockedReason: "Assign an owner.",
      ownerUserId: null,
      dueAt: null,
      metadata: { sourceVersion: 1 }
    };
    const first = applyDecisionCandidates({ existing: [], candidates: [candidate], now: "2026-08-02T10:00:00.000Z" });
    const second = applyDecisionCandidates({ existing: first.records, candidates: [candidate], now: "2026-08-02T10:01:00.000Z" });
    const third = applyDecisionCandidates({
      existing: second.records,
      candidates: [{ ...candidate, summary: "No accountable owner is assigned after import cleanup." }],
      now: "2026-08-02T10:02:00.000Z"
    });

    expect(first.opened).toHaveLength(1);
    expect(second.unchanged).toHaveLength(1);
    expect(third.superseded).toHaveLength(1);
    expect(third.opened).toHaveLength(1);
    expect(third.superseded[0]?.supersededByDecisionId).toBe(third.opened[0]?.id);
  });

  it("enforces lifecycle permissions and reason requirements", () => {
    const decision = baseDecision();

    expect(canMutateDecision({
      decision,
      action: "resolve",
      actorRole: "member",
      actorUserId: "member-1"
    })).toBe(false);
    expect(() => applyDecisionLifecycleAction(decision, {
      action: "accept_risk",
      actorRole: "operator",
      actorUserId: "operator-1",
      reason: "Accepting operational risk."
    })).toThrow("not allowed");
    expect(() => applyDecisionLifecycleAction(decision, {
      action: "accept_risk",
      actorRole: "admin",
      actorUserId: "admin-1"
    })).toThrow("requires a human-readable reason");

    const result = applyDecisionLifecycleAction(decision, {
      action: "resolve",
      actorRole: "owner",
      actorUserId: "owner-1",
      linkedOwnerUserId: "owner-1",
      reason: "Owner reviewed evidence.",
      now: "2026-08-02T11:00:00.000Z"
    });

    expect(result.decision.status).toBe("resolved");
    expect(result.event).toEqual(expect.objectContaining({
      name: "decision.resolved",
      decisionId: decision.id,
      ruleId: "weak_evidence"
    }));
  });

  it("turns SaaS rule outcomes and AI proposed facts into decision candidates", () => {
    const candidates = evaluateSaasRenewalDecisionCandidates({
      organizationId: "org-1",
      entityType: "saas_contract_term",
      entityId: "term-1",
      rulesInput: {
        noticeDeadline: "2026-08-05",
        today: "2026-08-02",
        autoRenewal: true,
        ownerUserId: null,
        evidenceConfidence: 0.4,
        contractValueAmount: 50000,
        metadataConflictCount: 1
      }
    });
    const aiFact = normalizeAiProposedFact({
      id: "00000000-0000-4000-8000-000000000011",
      organizationId: "org-1",
      entityType: "contract",
      entityId: "00000000-0000-4000-8000-000000000012",
      field: "notice_deadline_date",
      value: "2026-08-15",
      source: "extraction",
      confidence: 0.95,
      evidenceReference: { sourceLabel: "Reviewed extraction evidence" }
    });

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "weak_evidence", decisionType: "blocker" }),
      expect.objectContaining({ ruleId: "metadata_conflict", trustStatus: "conflicted" }),
      expect.objectContaining({ ruleId: "no_send_boundary", blockedReason: expect.stringContaining("send") })
    ]));
    expect(aiFactDecisionCandidate(aiFact)).toEqual(expect.objectContaining({
      ruleId: "ai_fact_requires_review",
      source: "ai",
      trustStatus: "proposed",
      decisionType: "blocker"
    }));
  });

  it("documents rule metadata and no-send boundaries", () => {
    const metadata = saasRenewalRuleMetadata();

    expect(metadata.find((rule) => rule.ruleId === "no_send_boundary")).toEqual(expect.objectContaining({
      noSendBoundary: true,
      category: expect.any(String)
    }));
    expect(metadata.every((rule) => rule.name && rule.description && rule.requiredInputs.length > 0)).toBe(true);
  });

  it("adds scoped decision_records persistence without broad member writes or deletes", () => {
    const migration = readProjectFile("supabase/migrations/202608020001_decision_records.sql");

    expect(migration).toContain("create table if not exists public.decision_records");
    expect(migration).toContain("alter table public.decision_records enable row level security");
    expect(migration).toContain("members can read decision records");
    expect(migration).toContain("for select using");
    expect(migration).toContain("review roles can insert decision records");
    expect(migration).toContain("review roles can update decision records");
    expect(migration).toContain("memberships.role in ('admin', 'operator', 'reviewer')");
    expect(migration).toContain("decision_records.owner_user_id = auth.uid()");
    expect(migration).not.toContain("for delete");
    expect(migration).not.toContain("for all");
  });
});
