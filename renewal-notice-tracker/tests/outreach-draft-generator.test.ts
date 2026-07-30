import { describe, expect, it } from "vitest";
import {
  buildInternalOutreachDraft,
  buildOutreachDraftWorkbenchInput
} from "@/lib/internal-outreach-intelligence/outreach-draft-generator";
import type {
  InternalOutreachOpportunity,
  OutreachDraftWorkbenchInput
} from "@/lib/internal-outreach-intelligence/outreach-types";

function opportunity(overrides: Partial<InternalOutreachOpportunity> = {}): InternalOutreachOpportunity {
  return {
    id: "opportunity-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    negotiation_brief_id: null,
    created_by_user_id: "user-1",
    owner_user_id: "owner-1",
    approver_user_id: "approver-1",
    opportunity_type: "price_increase",
    status: "ready_for_review",
    priority: "high",
    audience: "procurement",
    recommended_channel: "internal_email",
    reason_summary: "Renewal quote includes a material price increase.",
    expected_commercial_impact: {},
    evidence_confidence: 0.9,
    due_date: "2030-03-01",
    renewal_deadline: "2030-05-01",
    blocker_codes: [],
    warning_codes: [],
    safety_status: "safe",
    safety_reasons: [],
    submitted_at: null,
    approved_for_copy_at: null,
    dismissed_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("internal outreach draft generator", () => {
  it("creates bounded draft-only workbench copy with evidence-backed variants", () => {
    const draft = buildInternalOutreachDraft({
      opportunity: opportunity(),
      tone: "executive",
      channel: "internal_email"
    });

    expect(draft.copyAllowed).toBe(false);
    expect(draft.bodyPreview).toContain("INTERNAL DRAFT WORKBENCH");
    expect(draft.bodyPreview).toContain("Manual copy is blocked until reviewer approval");
    expect(draft.evidenceReferences).toEqual(expect.arrayContaining(["commercial_decision:decision-1", "contract:contract-1"]));
    expect(draft.variants.map((variant) => variant.variantType)).toEqual([
      "concise_email",
      "consultative_email",
      "founder_led_email",
      "linkedin_note",
      "internal_reviewer_summary"
    ]);
    for (const variant of draft.variants) {
      expect(variant.bodyPreview.length).toBeLessThanOrEqual(900);
      expect(variant.evidenceReferencesUsed).toEqual(expect.arrayContaining(["commercial_decision:decision-1"]));
      expect(variant.claimsRequiringReviewerApproval.length).toBeGreaterThan(0);
      expect(variant.qualityScore.overallApprovalReadiness).toBeGreaterThanOrEqual(0);
    }
    expect(draft.bodyPreview.length).toBeLessThanOrEqual(4000);
    expect(draft.bodyPreview).not.toMatch(/\b(send now|sendgrid|smtp|deliver externally)\b/i);
  });

  it("separates verified evidence, low-confidence signals, and unknown facts", () => {
    const model = buildOutreachDraftWorkbenchInput({
      opportunity: opportunity({
        warning_codes: ["weak_contract_evidence"],
        evidence_confidence: 0.62
      }),
      unavailableFacts: ["met at a conference", "requested a demo"]
    });
    const draft = buildInternalOutreachDraft({
      opportunity: opportunity(),
      workbenchInput: model
    });

    expect(model.productOffer.name).toBe("NoticeControl Renewal Defense");
    expect(model.verifiedEvidence.some((item) => item.importedSourceLabel)).toBe(true);
    expect(model.lowConfidenceSignals.length).toBeGreaterThan(0);
    expect(model.unavailableFacts).toContain("requested a demo");
    expect(draft.variants.map((variant) => variant.bodyPreview).join("\n")).not.toContain("requested a demo");
    expect(draft.bodyPreview).toContain("Unknown/unavailable facts not used");
  });

  it("blocks personalization that lacks a source URL or imported-source label", () => {
    const unsafeModel: OutreachDraftWorkbenchInput = {
      ...buildOutreachDraftWorkbenchInput({ opportunity: opportunity() }),
      verifiedEvidence: [{
        id: "prospect-signal-1",
        label: "Prospect signal",
        summary: "The company may have renewal risk.",
        sourceType: "system_record",
        confidence: 0.7,
        supportsPersonalization: true
      }]
    };
    const draft = buildInternalOutreachDraft({
      opportunity: opportunity(),
      workbenchInput: unsafeModel
    });

    expect(draft.safetyStatus).toBe("blocked");
    expect(draft.safetyReasons).toContain("personalization_without_approved_source");
  });

  it("preserves opportunity safety blockers on generated drafts", () => {
    const draft = buildInternalOutreachDraft({
      opportunity: opportunity({
        safety_status: "needs_review",
        safety_reasons: ["external_contact_placeholder_requires_review"]
      })
    });

    expect(draft.safetyStatus).toBe("needs_review");
    expect(draft.safetyReasons).toContain("external_contact_placeholder_requires_review");
  });
});
