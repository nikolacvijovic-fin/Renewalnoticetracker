import { describe, expect, it } from "vitest";
import { resolveOutreachAudience } from "@/lib/internal-outreach-intelligence/outreach-audience-resolver";
import { buildCrmNoteForOpportunity } from "@/lib/internal-outreach-intelligence/crm-note-builder";
import { buildInternalOutreachDraft } from "@/lib/internal-outreach-intelligence/outreach-draft-generator";
import { scoreOutreachOpportunity } from "@/lib/internal-outreach-intelligence/outreach-prioritization";
import {
  evaluateOutreachSafety,
  hashContactIdentifier,
  normalizeOutreachSuppressionReasonCode
} from "@/lib/internal-outreach-intelligence/outreach-safety";
import { planOutreachSequence } from "@/lib/internal-outreach-intelligence/outreach-sequence-planner";
import type {
  InternalOutreachDraft,
  InternalOutreachEvidenceLink,
  InternalOutreachOpportunity,
  InternalOutreachSuppression
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
    reason_summary: "Renewal quote includes a 20% price increase before the notice deadline.",
    expected_commercial_impact: { priceDeltaAmount: 25000, currency: "USD" },
    evidence_confidence: 0.9,
    due_date: "2030-01-15",
    renewal_deadline: "2030-03-01",
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

function draft(overrides: Partial<InternalOutreachDraft> = {}): InternalOutreachDraft {
  return {
    id: "draft-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    opportunity_id: "opportunity-1",
    created_by_user_id: "user-1",
    approver_user_id: "approver-1",
    status: "approved_for_copy",
    audience: "procurement",
    channel: "internal_email",
    tone: "procurement",
    title: "Internal draft",
    subject_or_heading: "Internal renewal action needed",
    body_preview: "[INTERNAL DRAFT ONLY]",
    key_points: [],
    evidence_references: ["commercial_decision:decision-1"],
    ask: "Review",
    next_step: "Manual copy after approval",
    internal_reviewer_note: "Review",
    safety_status: "safe",
    safety_reasons: [],
    copy_allowed: true,
    submitted_at: null,
    approved_for_copy_at: "2030-01-02T00:00:00.000Z",
    rejected_at: null,
    archived_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

function evidence(): InternalOutreachEvidenceLink {
  return {
    id: "link-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    commercial_decision_id: "decision-1",
    negotiation_brief_id: null,
    opportunity_id: "opportunity-1",
    evidence_type: "commercial_decision",
    evidence_id: "decision-1",
    evidence_label: "Commercial decision risk trigger",
    confidence: 0.9,
    metadata: {},
    created_by_user_id: "user-1",
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z"
  };
}

function suppression(overrides: Partial<InternalOutreachSuppression> = {}): InternalOutreachSuppression {
  return {
    id: "suppression-1",
    organization_id: "org-1",
    contract_id: "contract-1",
    opportunity_id: "opportunity-1",
    audience: "procurement",
    contact_identifier_hash: null,
    scoped_internal_user_id: null,
    reason_code: "legal_hold",
    notes_preview: null,
    suppressed_by_user_id: "user-1",
    suppressed_at: "2030-01-01T00:00:00.000Z",
    expires_at: null,
    created_at: "2030-01-01T00:00:00.000Z",
    updated_at: "2030-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("internal outreach workflow hardening", () => {
  it("scores opportunities from urgency, commercial impact, evidence, and suppression state", () => {
    const highPriority = scoreOutreachOpportunity({
      opportunity: opportunity(),
      drafts: [draft()],
      evidenceLinks: [evidence()],
      now: new Date("2030-01-01T00:00:00.000Z")
    });

    expect(highPriority.priorityScore).toBeGreaterThanOrEqual(65);
    expect(highPriority.priorityBand).toMatch(/high|critical/);
    expect(highPriority.nextBestAction).toMatch(/approved draft|approval/i);

    const blocked = scoreOutreachOpportunity({
      opportunity: opportunity(),
      suppressions: [suppression()]
    });
    expect(blocked).toEqual(expect.objectContaining({ priorityScore: 0, priorityBand: "blocked" }));
  });

  it("resolves audiences only from scoped member context or hashed placeholders", () => {
    const procurement = resolveOutreachAudience({
      opportunity: opportunity(),
      organizationMembers: [
        { user_id: "foreign-user", role: "admin", user: { full_name: "Wrong Org" } },
        { user_id: "owner-1", role: "procurement_reviewer", user: { notification_email: "procurement@example.test" } }
      ]
    });

    expect(procurement.userId).toBe("owner-1");
    expect(procurement.audienceRole).toBe("procurement_reviewer");

    const vendor = resolveOutreachAudience({
      opportunity: opportunity({ audience: "vendor_contact_placeholder" }),
      contactIdentifier: "Vendor@example.test"
    });
    expect(vendor.userId).toBeNull();
    expect(vendor.contactIdentifierHash).toBe(hashContactIdentifier("vendor@example.test"));
  });

  it("plans an internal sequence and blocks manual-copy prep when suppression exists", () => {
    const plan = planOutreachSequence({
      opportunity: opportunity(),
      draft: draft(),
      suppressions: [suppression()]
    });

    const vendorPrep = plan.steps.find((step) => step.stepType === "vendor_draft_prepare");
    expect(plan.blockerCodes).toContain("legal_hold");
    expect(vendorPrep).toEqual(expect.objectContaining({ approvalRequired: true, copyAllowed: false }));
    expect(plan.steps.map((step) => step.stepType)).toEqual(expect.arrayContaining(["procurement_review_note", "crm_note_prepare"]));
  });

  it("builds CRM note previews without raw customer or provider payloads", () => {
    const note = buildCrmNoteForOpportunity({
      opportunity: opportunity({ reason_summary: "Provider payload raw contract text OCR output" }),
      priority: scoreOutreachOpportunity({ opportunity: opportunity(), evidenceLinks: [evidence()] }),
      evidenceLinks: [evidence()]
    });

    expect(note.syncStatus).toBe("ready_for_manual_copy");
    expect(note.crmNoteBodyPreview).toContain("Commercial decision risk trigger");
    expect(note.crmNoteBodyPreview).not.toContain("raw contract text");
    expect(note.crmNoteBodyPreview).not.toContain("OCR output");
    expect(note.crmNoteBodyPreview).not.toContain("provider payload");
  });

  it("generates richer internal drafts while preserving no-delivery behavior", () => {
    const generated = buildInternalOutreachDraft({
      opportunity: opportunity(),
      tone: "legal",
      channel: "meeting_agenda"
    });

    expect(generated.bodyPreview).toContain("Purpose:");
    expect(generated.bodyPreview).toContain("Target action date:");
    expect(generated.bodyPreview).toContain("Commercial impact:");
    expect(generated.copyAllowed).toBe(false);
    expect(generated.safetyReasons).not.toContain("external_send_action_detected");
  });

  it("blocks unsafe claims, external delivery language, unscoped personal data, and unknown suppression reasons", () => {
    const safety = evaluateOutreachSafety({
      audience: "procurement",
      draftText: "As discussed, guaranteed savings are ready. Send now to the private email from the scraped contact.",
      hasEvidenceForSavingsClaim: false
    });

    expect(safety.safetyStatus).toBe("blocked");
    expect(safety.safetyReasons).toEqual(
      expect.arrayContaining([
        "unsupported_or_deceptive_claim",
        "savings_claim_without_evidence",
        "external_send_action_detected",
        "unscoped_personal_data_detected"
      ])
    );
    expect(normalizeOutreachSuppressionReasonCode("random")).toBe("manually_dismissed");
    expect(normalizeOutreachSuppressionReasonCode("legal_hold")).toBe("legal_hold");
  });
});
