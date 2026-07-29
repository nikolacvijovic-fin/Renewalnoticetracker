import { describe, expect, it } from "vitest";
import { buildInternalOutreachDraft } from "@/lib/internal-outreach-intelligence/outreach-draft-generator";
import type { InternalOutreachOpportunity } from "@/lib/internal-outreach-intelligence/outreach-types";

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
  it("creates bounded internal draft-only copy with evidence references", () => {
    const draft = buildInternalOutreachDraft({
      opportunity: opportunity(),
      tone: "executive",
      channel: "internal_email"
    });

    expect(draft.copyAllowed).toBe(false);
    expect(draft.bodyPreview).toContain("INTERNAL DRAFT ONLY");
    expect(draft.bodyPreview).toContain("manual copy only");
    expect(draft.evidenceReferences).toEqual(expect.arrayContaining(["commercial_decision:decision-1", "contract:contract-1"]));
    expect(draft.bodyPreview.length).toBeLessThanOrEqual(4000);
    expect(draft.bodyPreview).not.toMatch(/\b(send now|sendgrid|smtp|deliver externally)\b/i);
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
