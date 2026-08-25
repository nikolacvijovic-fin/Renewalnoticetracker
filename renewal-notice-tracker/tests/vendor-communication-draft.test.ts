import { describe, expect, it } from "vitest";
import { buildVendorCommunicationDraft } from "@/lib/negotiation-workflow/vendor-communication-draft";
import type { NegotiationBrief } from "@/lib/negotiation-workflow/negotiation-types";

function brief(overrides: Partial<NegotiationBrief> = {}): NegotiationBrief {
  return {
    id: "brief-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    created_by_user_id: "user-1",
    owner_user_id: "owner-1",
    approver_user_id: "approver-1",
    status: "approved",
    strategy: "challenge_price_increase",
    executive_summary: "Commercial decision recommends renegotiate.",
    target_ask: "Challenge the price increase.",
    fallback_position: "Request a short extension.",
    evidence_summary: {},
    commercial_risk_summary: "Quote increased beyond approved threshold.",
    savings_argument: "Use documented savings opportunity as leverage.",
    deadline_risk: "Notice deadline: 2030-03-01.",
    blocker_codes: [],
    warning_codes: [],
    review_flags: [],
    confidence_score: 0.92,
    submitted_at: null,
    approved_at: "2030-01-02T00:00:00.000Z",
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("buildVendorCommunicationDraft", () => {
  it("marks vendor communication as internal draft-only and copy/manual only", () => {
    const draft = buildVendorCommunicationDraft({ brief: brief(), tone: "firm", channel: "email" });

    expect(draft.draftBody).toContain("[INTERNAL DRAFT ONLY - DO NOT SEND AUTOMATICALLY]");
    expect(draft.draftBody).toContain("manual copy only");
    expect(draft.evidenceTrace).toMatchObject({ draftOnly: true, automaticSending: false });
  });

  it("does not include raw contract, OCR, provider, token, or storage markers", () => {
    const draft = buildVendorCommunicationDraft({
      brief: brief({
        commercial_risk_summary: "raw contract text: customer confidential body",
        savings_argument: "provider payload included",
        deadline_risk: "storage path /contracts/private.pdf",
        target_ask: "token abc123"
      })
    });
    const serialized = JSON.stringify(draft);

    expect(serialized).toContain("[redacted: sensitive source content removed]");
    expect(serialized).not.toContain("customer confidential body");
    expect(serialized).not.toContain("/contracts/private.pdf");
    expect(serialized).not.toContain("abc123");
  });

  it("supports tone and channel variants without adding an external delivery action", () => {
    const callScript = buildVendorCommunicationDraft({ brief: brief(), tone: "executive", channel: "call_script" });

    expect(callScript.subject).toBeNull();
    expect(callScript.draftBody).toContain("Call script tone: executive");
    expect(callScript.evidenceTrace).toMatchObject({ automaticSending: false });
  });

  it("supports each approved draft intent without claiming delivery or contractual validity", () => {
    for (const draftType of [
      "request_renewal_quote",
      "request_seat_reduction_pricing",
      "challenge_price_increase",
      "request_revised_payment_terms",
      "notice_of_nonrenewal",
      "request_additional_time"
    ] as const) {
      const draft = buildVendorCommunicationDraft({ brief: brief(), draftType });
      expect(draft.draftType).toBe(draftType);
      expect(draft.subject).toContain("Draft only");
      expect(draft.draftBody).toContain("DO NOT SEND AUTOMATICALLY");
      expect(draft.draftBody).not.toMatch(/NoticeControl (sent|delivered|cancelled)/i);
    }
  });
});
