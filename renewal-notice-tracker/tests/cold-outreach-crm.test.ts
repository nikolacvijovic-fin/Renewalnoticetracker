import { describe, expect, it } from "vitest";
import {
  buildColdOutreachCrmMetrics,
  evaluateColdOutreachActivity,
  evaluateColdOutreachStageTransition,
  sanitizeColdOutreachActivityMetadata
} from "@/lib/internal-outreach-intelligence/cold-outreach-crm";

describe("cold outreach founder CRM helpers", () => {
  it("allows valid founder CRM stage transitions", () => {
    expect(evaluateColdOutreachStageTransition({
      fromStage: "new",
      toStage: "qualified",
      suppressionStatus: "not_suppressed"
    })).toMatchObject({
      allowed: true,
      resultingStage: "qualified",
      reasonCodes: []
    });

    expect(evaluateColdOutreachStageTransition({
      fromStage: "draft_ready",
      toStage: "copied_manually",
      suppressionStatus: "not_suppressed",
      hasApprovedForCopyDraft: true
    })).toMatchObject({
      allowed: true,
      resultingStage: "copied_manually",
      reasonCodes: []
    });
  });

  it("rejects invalid stage transitions", () => {
    const result = evaluateColdOutreachStageTransition({
      fromStage: "new",
      toStage: "meeting_booked",
      suppressionStatus: "not_suppressed"
    });

    expect(result.allowed).toBe(false);
    expect(result.resultingStage).toBe("new");
    expect(result.reasonCodes).toContain("stage_transition_not_allowed");
  });

  it("lets suppression override active workflow movement", () => {
    const blocked = evaluateColdOutreachStageTransition({
      fromStage: "qualified",
      toStage: "draft_ready",
      suppressionStatus: "opted_out"
    });
    const allowedTerminal = evaluateColdOutreachStageTransition({
      fromStage: "qualified",
      toStage: "suppressed",
      suppressionStatus: "opted_out"
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCodes).toContain("suppression_overrides_active_workflow");
    expect(allowedTerminal.allowed).toBe(true);
    expect(allowedTerminal.resultingStage).toBe("suppressed");
  });

  it("requires an approved-for-copy draft before copied_manually", () => {
    const blocked = evaluateColdOutreachStageTransition({
      fromStage: "draft_ready",
      toStage: "copied_manually",
      suppressionStatus: "not_suppressed",
      hasApprovedForCopyDraft: false
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.reasonCodes).toContain("approved_for_copy_draft_required");
  });

  it("keeps manual send logging manual-only and never creates provider/send semantics", () => {
    const blocked = evaluateColdOutreachActivity({
      activityType: "manual_send_logged",
      currentStage: "copied_manually",
      suppressionStatus: "not_suppressed",
      draftApprovalState: "approved_for_copy",
      performedOutsideNoticeControl: false,
      metadata: {
        providerPayload: "sendgrid provider payload should not survive",
        deliveryProvider: "external delivery provider",
        reasonCode: "manual_follow_up"
      }
    });
    const allowed = evaluateColdOutreachActivity({
      activityType: "manual_send_logged",
      currentStage: "copied_manually",
      suppressionStatus: "not_suppressed",
      draftApprovalState: "approved_for_copy",
      performedOutsideNoticeControl: true,
      metadata: {
        reasonCode: "manual_follow_up"
      }
    });

    expect(blocked.allowed).toBe(false);
    expect(blocked.noticeControlSent).toBe(false);
    expect(blocked.reasonCodes).toContain("manual_send_must_be_outside_noticecontrol");
    expect(JSON.stringify(blocked.safeMetadata)).not.toMatch(/sendgrid|external delivery provider|provider/i);
    expect(allowed.allowed).toBe(true);
    expect(allowed.noticeControlSent).toBe(false);
  });

  it("strips unsafe activity metadata while preserving allowlisted fields", () => {
    const metadata = sanitizeColdOutreachActivityMetadata({
      organizationId: "org-1",
      leadId: "lead-1",
      nextAction: "Review founder-led draft",
      noteRecorded: true,
      rawContractText: "raw contract text should not survive",
      emailBody: "private email body should not survive",
      nested: {
        token: "secret"
      },
      reasonCodes: ["manual_review", "raw provider payload should be stripped"]
    });

    expect(metadata).toMatchObject({
      organizationId: "org-1",
      leadId: "lead-1",
      nextAction: "Review founder-led draft",
      noteRecorded: true,
      reasonCodes: ["manual_review"]
    });
    expect(JSON.stringify(metadata)).not.toMatch(/raw contract|private email|secret|provider payload/i);
  });

  it("counts CRM metrics for the founder queue", () => {
    const metrics = buildColdOutreachCrmMetrics({
      leads: [
        { stage: "new", suppressionStatus: "not_suppressed" },
        { stage: "draft_ready", suppressionStatus: "not_suppressed" },
        { stage: "suppressed", suppressionStatus: "suppressed" },
        { stage: "not_fit", suppressionStatus: "not_suppressed" }
      ],
      drafts: [
        { approvalState: "approved_for_copy" },
        { approvalState: "needs_review" },
        { approvalState: "approved_for_copy" }
      ],
      activities: [
        { activityType: "manual_send_logged" },
        { activityType: "reply_received" },
        { activityType: "meeting_booked" },
        { activityType: "manual_send_logged" }
      ]
    });

    expect(metrics.leadsByStage.new).toBe(1);
    expect(metrics.leadsByStage.draft_ready).toBe(1);
    expect(metrics.approvedDraftsForCopy).toBe(2);
    expect(metrics.manualSendsLogged).toBe(2);
    expect(metrics.repliesLogged).toBe(1);
    expect(metrics.meetingsBooked).toBe(1);
    expect(metrics.suppressedCount).toBe(1);
    expect(metrics.notFitCount).toBe(1);
  });
});
