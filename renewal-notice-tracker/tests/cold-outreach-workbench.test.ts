import { describe, expect, it } from "vitest";
import {
  buildColdOutreachAuditMetadata,
  buildColdOutreachEvidenceReferences,
  buildFounderLedColdOutreachDraftWorkbench,
  evaluateColdOutreachApproval,
  normalizeColdOutreachLeadCompany,
  normalizeColdOutreachOfferIcp,
  NOTICECONTROL_COLD_OUTREACH_OFFER
} from "@/lib/internal-outreach-intelligence/cold-outreach-workbench";
import type {
  ColdOutreachLeadCompanyInput,
  ColdOutreachOfferIcpInput
} from "@/lib/internal-outreach-intelligence/cold-outreach-types";

function lead(overrides: Partial<ColdOutreachLeadCompanyInput> = {}) {
  return normalizeColdOutreachLeadCompany({
    organizationId: "org-1",
    companyName: "Acme Finance",
    website: "https://acme.example",
    industry: "Finance operations",
    companySizeBand: "201_1000",
    roleTitle: "CFO",
    sourceLabel: "Imported founder prospect list 2026-07",
    sourceUrl: "https://example.com/acme-renewal-signal",
    painSignal: "Acme mentions vendor renewal governance in a public operating note.",
    evidenceConfidence: 0.86,
    suppressionStatus: "not_suppressed",
    ...overrides
  });
}

function offer(overrides: Partial<ColdOutreachOfferIcpInput> = {}) {
  return normalizeColdOutreachOfferIcp({
    offerName: "NoticeControl CFO Opt-Out Clock",
    targetCustomer: "CFOs and procurement leaders managing recurring vendor renewals",
    primaryPain: "renewal deadlines can become visible too late",
    valueProp: "NoticeControl gives finance teams a controlled opt-out clock and renewal-defense workflow.",
    proofPoints: ["CFO Opt-Out Clock", "evidence-backed renewal review"],
    disallowedClaims: ["guaranteed savings", "guaranteed ROI", "prior conversation"],
    ...overrides
  });
}

describe("founder-led cold outreach MVP workbench", () => {
  it("normalizes the lead/company input model with scoped safe identifiers", () => {
    const normalized = lead();

    expect(normalized.organizationId).toBe("org-1");
    expect(normalized.companyName).toBe("Acme Finance");
    expect(normalized.websiteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.companySizeBand).toBe("201_1000");
    expect(normalized.roleTitle).toBe("CFO");
    expect(normalized.sourceLabel).toContain("Imported founder prospect list");
    expect(normalized.blockerCodes).toEqual([]);
  });

  it("normalizes the offer/ICP model and preserves disallowed claims", () => {
    const normalized = offer();

    expect(normalized.offerName).toBe("NoticeControl CFO Opt-Out Clock");
    expect(normalized.targetCustomer).toContain("CFOs");
    expect(normalized.primaryPain).toContain("renewal deadlines");
    expect(normalized.valueProp).toContain("opt-out clock");
    expect(normalized.proofPoints).toContain("CFO Opt-Out Clock");
    expect(normalized.disallowedClaims).toContain("guaranteed ROI");
    expect(normalized.blockerCodes).toEqual([]);
  });

  it("generates safe draft variants with evidence references for personalization", () => {
    const workbench = buildFounderLedColdOutreachDraftWorkbench({
      lead: lead(),
      offer: offer(),
      reviewerApproved: false
    });

    expect(workbench.copyAllowed).toBe(false);
    expect(workbench.variants.map((variant) => variant.variantType)).toEqual([
      "concise_email",
      "founder_led_email",
      "linkedin_note",
      "internal_reviewer_summary"
    ]);
    for (const variant of workbench.variants) {
      expect(variant.bodyPreview.length).toBeLessThanOrEqual(900);
      expect(variant.bodyPreview).toContain("Imported founder prospect list 2026-07");
      expect(variant.bodyPreview).toContain("cautious hypothesis");
      expect(variant.evidenceReferencesUsed.some((reference) => reference.field === "pain_signal")).toBe(true);
      expect(variant.claimsRequiringReviewerApproval).toEqual(expect.arrayContaining([
        "Disallowed unless separately verified: guaranteed ROI"
      ]));
      expect(variant.bodyPreview).not.toMatch(/as discussed|guaranteed ROI|guaranteed savings|send now/i);
    }
    expect(workbench.approval.approvalState).toBe("needs_review");
    expect(workbench.approval.blockers).toContain("reviewer_approval_required");
  });

  it("excludes unknown facts from generated prospect-facing variants", () => {
    const workbench = buildFounderLedColdOutreachDraftWorkbench({
      lead: lead({ painSignal: "Acme has a public procurement operations note." }),
      reviewerApproved: false
    });
    const copy = workbench.variants.map((variant) => variant.bodyPreview).join("\n");

    expect(workbench.unavailableFacts).toContain("prior relationship or conversation");
    expect(copy).not.toContain("prior relationship");
    expect(copy).not.toContain("recipient intent");
    expect(copy).not.toContain("guaranteed savings");
  });

  it("blocks missing evidence references for personalization", () => {
    const model = lead({
      sourceLabel: null,
      sourceUrl: null,
      painSignal: "Acme may have renewal pressure."
    });
    const workbench = buildFounderLedColdOutreachDraftWorkbench({
      lead: model,
      reviewerApproved: true
    });

    expect(model.blockerCodes).toContain("source_evidence_required");
    expect(workbench.safetyStatus).toBe("blocked");
    expect(workbench.safetyReasons).toContain("source_evidence_required");
    expect(workbench.approval.copyAllowed).toBe(false);
  });

  it("blocks suppression before approval", () => {
    const workbench = buildFounderLedColdOutreachDraftWorkbench({
      lead: lead({ suppressionStatus: "opted_out" }),
      reviewerApproved: true
    });

    expect(workbench.safetyStatus).toBe("blocked");
    expect(workbench.approval.copyAllowed).toBe(false);
    expect(workbench.approval.blockers).toContain("contact_opted_out");
  });

  it("requires safe status and reviewer approval before approved_for_copy", () => {
    expect(evaluateColdOutreachApproval({
      safetyStatus: "safe",
      reviewerApproved: false,
      suppressionStatus: "not_suppressed"
    })).toEqual({
      approvalState: "needs_review",
      copyAllowed: false,
      blockers: ["reviewer_approval_required"]
    });

    expect(evaluateColdOutreachApproval({
      safetyStatus: "safe",
      reviewerApproved: true,
      suppressionStatus: "not_suppressed"
    })).toEqual({
      approvalState: "approved_for_copy",
      copyAllowed: true,
      blockers: []
    });
  });

  it("keeps audit metadata safe and does not include raw website values", () => {
    const metadata = buildColdOutreachAuditMetadata({
      lead: lead(),
      offer: NOTICECONTROL_COLD_OUTREACH_OFFER,
      approvalState: "needs_review",
      metadata: {
        rawContractText: "raw contract text should be stripped"
      }
    });

    expect(metadata.websiteHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(metadata)).not.toContain("https://acme.example");
    expect(JSON.stringify(metadata)).not.toContain("raw contract text should be stripped");
  });

  it("builds evidence references from every supported personalization field", () => {
    const references = buildColdOutreachEvidenceReferences(lead());

    expect(references.map((reference) => reference.field)).toEqual(expect.arrayContaining([
      "company_name",
      "website",
      "industry",
      "company_size_band",
      "role_title",
      "pain_signal"
    ]));
  });
});
