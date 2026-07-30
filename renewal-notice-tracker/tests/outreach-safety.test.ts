import { describe, expect, it } from "vitest";
import {
  assertNoExternalOutreachSendPath,
  evaluateOutreachCopyApproval,
  evaluateOutreachSafety,
  hashContactIdentifier,
  sanitizeOutreachText
} from "@/lib/internal-outreach-intelligence/outreach-safety";

describe("internal outreach safety", () => {
  it("hashes normalized contact identifiers without storing raw emails", () => {
    expect(hashContactIdentifier(" CFO@Example.COM ")).toBe(hashContactIdentifier("cfo@example.com"));
    expect(hashContactIdentifier("cfo@example.com")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("blocks sensitive markers and deceptive claims", () => {
    expect(
      evaluateOutreachSafety({
        audience: "finance",
        draftText: "Use raw contract text and provider payload in this note",
        hasEvidenceForSavingsClaim: true
      })
    ).toEqual(expect.objectContaining({ safetyStatus: "blocked" }));

    expect(
      evaluateOutreachSafety({
        audience: "internal_owner",
        draftText: "As discussed, guaranteed savings are available",
        hasEvidenceForSavingsClaim: true
      })
    ).toEqual(expect.objectContaining({ safetyStatus: "blocked" }));

    expect(
      evaluateOutreachSafety({
        audience: "finance",
        draftText: "This will produce guaranteed ROI and 30% ROI",
        hasEvidenceForSavingsClaim: true
      })
    ).toEqual(expect.objectContaining({
      safetyStatus: "blocked",
      safetyReasons: expect.arrayContaining(["unsupported_or_deceptive_claim"])
    }));
  });

  it("keeps external delivery actions outside the internal outreach boundary", () => {
    expect(assertNoExternalOutreachSendPath("createDraft")).toEqual({ allowed: true, reasonCode: null });
    expect(assertNoExternalOutreachSendPath("sendExternalEmail")).toEqual({
      allowed: false,
      reasonCode: "external_send_action_not_supported"
    });
    expect(sanitizeOutreachText("raw OCR output from uploaded document")).toBe("[redacted: sensitive source content removed]");
  });

  it("requires approved personalization sources and reviewer approval before copy", () => {
    expect(
      evaluateOutreachSafety({
        audience: "procurement",
        draftText: "Personalized note based on an unapproved source",
        usesPersonalization: true,
        hasApprovedPersonalizationSource: false
      })
    ).toEqual(expect.objectContaining({
      safetyStatus: "blocked",
      safetyReasons: expect.arrayContaining(["personalization_without_approved_source"])
    }));

    expect(
      evaluateOutreachSafety({
        audience: "procurement",
        draftText: "Reviewed evidence-backed note",
        hasApprovedPersonalizationSource: true,
        copyRequested: true,
        suppressionCheckCompleted: false,
        reviewerApproved: false
      })
    ).toEqual(expect.objectContaining({
      safetyStatus: "blocked",
      safetyReasons: expect.arrayContaining([
        "suppression_check_required_before_copy",
        "copy_requires_human_approval"
      ])
    }));

    expect(evaluateOutreachCopyApproval({
      safetyStatus: "safe",
      suppressionActive: true,
      reviewerApproved: true
    })).toEqual({
      copyAllowed: false,
      blockers: ["active_suppression"]
    });
    expect(evaluateOutreachCopyApproval({
      safetyStatus: "safe",
      suppressionActive: false,
      reviewerApproved: true
    })).toEqual({ copyAllowed: true, blockers: [] });
  });
});
