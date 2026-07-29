import { describe, expect, it } from "vitest";
import {
  assertNoExternalOutreachSendPath,
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
  });

  it("keeps external delivery actions outside the internal outreach boundary", () => {
    expect(assertNoExternalOutreachSendPath("createDraft")).toEqual({ allowed: true, reasonCode: null });
    expect(assertNoExternalOutreachSendPath("sendExternalEmail")).toEqual({
      allowed: false,
      reasonCode: "external_send_action_not_supported"
    });
    expect(sanitizeOutreachText("raw OCR output from uploaded document")).toBe("[redacted: sensitive source content removed]");
  });
});
