import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyGovernedActionLifecycleTransition } from "@/lib/action-governance/action-actions";
import { createGovernedActionRecord, governedActionCandidateFromDecision } from "@/lib/action-governance/action-records";
import { applyGovernedActionCandidates } from "@/lib/action-governance/action-repository";
import { evaluateGovernedActionPolicy } from "@/lib/action-governance/action-policy";
import { summarizeGovernedActionQueues } from "@/lib/action-governance/action-engine";
import { createNoSendBoundaryEvent } from "@/lib/action-governance/action-events";
import { createDecisionRecord } from "@/lib/decision-intelligence/decision-records";
import { buildUnifiedIntelligenceSummary } from "@/lib/intelligence/unified-intelligence-engine";
import { evaluateSaasRenewalGovernedActionCandidates } from "@/lib/rules/saas-renewal-rules";
import type { GovernedActionCandidate, GovernedActionRecord } from "@/lib/action-governance/action-types";

const projectRoot = process.cwd();

function readProjectFile(relativePath: string) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function candidate(overrides: Partial<GovernedActionCandidate> = {}): GovernedActionCandidate {
  return {
    organizationId: "org-1",
    decisionId: "decision-1",
    entityType: "saas_import_row",
    entityId: "00000000-0000-4000-8000-000000000001",
    actionType: "activate_import_row",
    title: "Activate reviewed SaaS import row",
    summary: "Create trusted Opt-Out Clock record after review.",
    source: "decision",
    severity: "high",
    trustStatus: "trusted",
    requiredRole: "operator",
    ownerUserId: "owner-1",
    dueAt: null,
    blockedReason: null,
    requiredEvidence: [],
    evidenceRefs: [{ code: "row_status", source: "saas_import", value: "ready" }],
    allowedTransitions: ["mark_ready", "approve", "complete_manually", "dismiss", "accept_risk", "supersede", "reopen"],
    metadata: {},
    ...overrides
  };
}

function action(overrides: Partial<GovernedActionCandidate> = {}): GovernedActionRecord {
  return createGovernedActionRecord(candidate(overrides), "2026-08-02T10:00:00.000Z");
}

describe("Enterprise Action Governance", () => {
  it("dedupes unchanged governed actions and supersedes stale action candidates", () => {
    const first = applyGovernedActionCandidates({
      existing: [],
      candidates: [candidate()],
      now: "2026-08-02T10:00:00.000Z"
    });
    const second = applyGovernedActionCandidates({
      existing: first.records,
      candidates: [candidate()],
      now: "2026-08-02T10:01:00.000Z"
    });
    const third = applyGovernedActionCandidates({
      existing: second.records,
      candidates: [candidate({ summary: "Create trusted Opt-Out Clock record after corrected review." })],
      now: "2026-08-02T10:02:00.000Z"
    });

    expect(first.opened).toHaveLength(1);
    expect(second.unchanged).toHaveLength(1);
    expect(third.superseded).toHaveLength(1);
    expect(third.opened[0]?.status).toBe("proposed");
    expect(third.superseded[0]?.supersededByActionId).toBe(third.opened[0]?.id);
  });

  it("blocks unauthorized roles and linked owners outside their assigned entity", () => {
    const rowAction = action({ requiredRole: "reviewer", actionType: "resolve_metadata_conflict" });

    expect(evaluateGovernedActionPolicy(rowAction, {
      actorRole: "member",
      actorUserId: "member-1"
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasonCodes: ["permission_denied"]
    }));
    expect(evaluateGovernedActionPolicy(rowAction, {
      actorRole: "owner",
      actorUserId: "owner-2",
      linkedOwnerUserId: "owner-2"
    }).allowed).toBe(false);
    expect(evaluateGovernedActionPolicy(rowAction, {
      actorRole: "owner",
      actorUserId: "owner-1",
      linkedOwnerUserId: "owner-1",
      evidenceCodes: ["review_reason"],
      reason: "Owner reviewed linked contract evidence."
    }).allowed).toBe(true);
  });

  it("blocks import activation unless the persisted row is ready or corrected", () => {
    const rowAction = action({ actionType: "activate_import_row", requiredRole: "operator" });

    expect(evaluateGovernedActionPolicy(rowAction, {
      actorRole: "operator",
      actorUserId: "operator-1",
      importRowStatus: "needs_review"
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasonCodes: ["import_row_not_ready"]
    }));
    expect(evaluateGovernedActionPolicy(rowAction, {
      actorRole: "operator",
      actorUserId: "operator-1",
      importRowStatus: "corrected"
    }).allowed).toBe(true);
  });

  it("requires explicit reason for accepted risk and blocks completed manual action from blocked state", () => {
    const riskAction = action({
      actionType: "accept_renewal_risk",
      requiredRole: "operator",
      allowedTransitions: ["accept_risk"]
    });
    const blockedAction = action({
      status: "blocked",
      blockedReason: "Review evidence first.",
      actionType: "correct_import_row",
      requiredRole: "operator",
      allowedTransitions: ["complete_manually"]
    });

    expect(() => applyGovernedActionLifecycleTransition(riskAction, {
      transition: "accept_risk",
      actorRole: "operator",
      actorUserId: "operator-1"
    })).toThrow("requires a human-readable reason");
    expect(() => applyGovernedActionLifecycleTransition(blockedAction, {
      transition: "complete_manually",
      actorRole: "operator",
      actorUserId: "operator-1"
    })).toThrow("Review evidence first.");

    const result = applyGovernedActionLifecycleTransition(riskAction, {
      transition: "accept_risk",
      actorRole: "operator",
      actorUserId: "operator-1",
      reason: "CFO accepted renewal exposure.",
      now: "2026-08-02T11:00:00.000Z"
    });

    expect(result.action.status).toBe("accepted_risk");
    expect(result.events[0]).toEqual(expect.objectContaining({ name: "action.risk_accepted" }));
  });

  it("records manual notice actions as outside NoticeControl only", () => {
    const manualAction = action({
      actionType: "mark_notice_sent_manually",
      requiredRole: "operator",
      status: "ready",
      allowedTransitions: ["complete_manually"],
      metadata: { noSendBoundary: true }
    });

    expect(evaluateGovernedActionPolicy(manualAction, {
      actorRole: "operator",
      actorUserId: "operator-1"
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasonCodes: ["manual_outside_noticecontrol_confirmation_required"]
    }));

    const result = applyGovernedActionLifecycleTransition(manualAction, {
      transition: "complete_manually",
      actorRole: "operator",
      actorUserId: "operator-1",
      explicitManualOutsideNoticeControlConfirmation: true,
      now: "2026-08-02T11:00:00.000Z"
    });

    expect(result.action.status).toBe("completed_manually");
    expect(result.events.map((event) => event.name)).toEqual([
      "action.completed_manually",
      "action.no_send_boundary_checked"
    ]);
    expect(JSON.stringify(result.events)).toContain("manualOutsideNoticeControl");
    expect(JSON.stringify(result.events)).not.toMatch(/provider payload|sendgrid|resend|sequence|recipient email body/i);
  });

  it("prevents AI fact review self-approval", () => {
    const aiAction = action({
      actionType: "review_ai_fact",
      requiredRole: "reviewer",
      status: "ready"
    });

    expect(evaluateGovernedActionPolicy(aiAction, {
      actorRole: "reviewer",
      actorUserId: "reviewer-1",
      aiFactSource: "ai",
      aiFactReviewedByUserId: "reviewer-1"
    })).toEqual(expect.objectContaining({
      allowed: false,
      reasonCodes: ["ai_self_approval_blocked"]
    }));
  });

  it("strips sensitive metadata from governed action events", () => {
    const manualAction = action({
      actionType: "mark_notice_sent_manually",
      metadata: {
        noSendBoundary: true,
        rawContractText: "raw contract body should not survive",
        nested: { providerPayload: "secret token" }
      }
    });
    const event = createNoSendBoundaryEvent({
      action: manualAction,
      blocked: true,
      actorUserId: "operator-1",
      occurredAt: "2026-08-02T11:00:00.000Z"
    });

    expect(event.name).toBe("action.no_send_boundary_blocked");
    expect(JSON.stringify(event)).not.toMatch(/raw contract|secret token|provider payload|private note|email body/i);
    expect(event.metadata).toEqual(expect.objectContaining({
      manualOnly: true,
      manualOutsideNoticeControl: true,
      noticeControlSent: false
    }));
  });

  it("creates governed action candidates from rules and decisions", () => {
    const actions = evaluateSaasRenewalGovernedActionCandidates({
      organizationId: "org-1",
      entityType: "saas_contract_term",
      entityId: "00000000-0000-4000-8000-000000000011",
      rulesInput: {
        noticeDeadline: null,
        today: "2026-08-02",
        ownerUserId: null,
        evidenceConfidence: 0.4,
        duplicateImportSuspected: true,
        metadataConflictCount: 1
      },
      now: "2026-08-02T10:00:00.000Z"
    });

    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "review_notice_deadline" }),
      expect.objectContaining({ actionType: "accept_weak_evidence" }),
      expect.objectContaining({ actionType: "assign_owner" }),
      expect.objectContaining({ actionType: "resolve_metadata_conflict" }),
      expect.objectContaining({ actionType: "dismiss_duplicate_import" })
    ]));
  });

  it("aggregates governed action queues in unified intelligence", () => {
    const decision = createDecisionRecord({
      organizationId: "org-1",
      entityType: "contract",
      entityId: "00000000-0000-4000-8000-000000000021",
      decisionType: "blocker",
      title: "Missing notice deadline",
      summary: "Notice deadline must be reviewed.",
      severity: "high",
      source: "rule",
      ruleId: "missing_notice_deadline",
      aiFactId: null,
      confidence: null,
      trustStatus: "blocked",
      evidenceRefs: [{ code: "notice_deadline_missing", source: "system_rule" }],
      allowedActions: ["review_evidence"],
      blockedReason: "Review source evidence.",
      ownerUserId: "owner-1",
      dueAt: "2026-08-01T00:00:00.000Z",
      metadata: {}
    }, "2026-08-02T10:00:00.000Z");
    const summary = buildUnifiedIntelligenceSummary({
      organizationId: "org-1",
      generatedAt: "2026-08-02T12:00:00.000Z",
      decisionRecords: [decision]
    });

    expect(summary.actionGovernance.blockedActions).toHaveLength(1);
    expect(summary.actionGovernance.approvalRequiredActions).toHaveLength(1);
    expect(summary.actionGovernance.overdueActions).toHaveLength(1);
    expect(summary.actionGovernance.actionsByOwner).toEqual([
      { ownerUserId: "owner-1", count: 1, blockedCount: 1, readyCount: 0 }
    ]);
  });

  it("adds governed_actions RLS without broad member writes or deletes", () => {
    const migration = readProjectFile("supabase/migrations/202608020002_governed_actions.sql");

    expect(migration).toContain("create table if not exists public.governed_actions");
    expect(migration).toContain("alter table public.governed_actions enable row level security");
    expect(migration).toContain("members can read governed actions");
    expect(migration).toContain("for select using");
    expect(migration).toContain("review roles can insert governed actions");
    expect(migration).toContain("review roles and linked owners can update governed actions");
    expect(migration).toContain("memberships.role in ('admin', 'operator', 'reviewer')");
    expect(migration).toContain("governed_actions.owner_user_id = auth.uid()");
    expect(migration).not.toContain("for delete");
    expect(migration).not.toContain("for all");
  });

  it("keeps the action governance slice free of provider sending implementation", () => {
    const files = [
      "lib/action-governance/action-types.ts",
      "lib/action-governance/action-policy.ts",
      "lib/action-governance/action-records.ts",
      "lib/action-governance/action-actions.ts",
      "lib/action-governance/action-events.ts",
      "lib/action-governance/action-engine.ts"
    ].map(readProjectFile).join("\n");

    expect(files).not.toMatch(/resend|sendgrid|smtp|mailgun|provider\.send|fetch\(/i);
    expect(files).toMatch(/manual/i);
  });
});
