import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ICP_PROFILES,
  PRODUCT_OFFER_PROFILES,
  canExportOutreach,
  classifyLeadEligibility,
  evaluateOutreachApprovalTransition,
  evaluateOutreachCompliance,
  explainIcpFit,
  type FutureLeadRecord
} from "@/deferred/revenue-intelligence/foundation";
import { MARKET_PROFILES, canSelfServeActivateMarket } from "@/lib/product/market-profiles";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments: string[]) {
  return fs.readFileSync(path.join(repoRoot, ...segments), "utf8");
}

const offer = PRODUCT_OFFER_PROFILES.noticecontrol_contract_intelligence;
const icp = ICP_PROFILES.noticecontrol_ops_procurement_midmarket;

function eligibleLead(overrides: Partial<FutureLeadRecord> = {}): FutureLeadRecord {
  return {
    company: {
      name: "Acme Operations",
      domain: "acme.example",
      countryOrMarket: "global",
      industry: "software",
      size: "50-500"
    },
    lead: {
      role: "Head of Operations",
      seniority: "director",
      department: "operations",
      language: "en",
      timeZone: "America/New_York",
      recipientType: "business"
    },
    evidence: {
      sourceUrl: "https://acme.example/team",
      sourceText: "Acme is hiring procurement operations leaders to clean up vendor renewals.",
      evidenceFields: ["company", "role", "renewal_trigger"]
    },
    compliance: {
      legalBasis: "business_legitimate_interest",
      optOutSuppressed: false,
      previousContactStatus: "none",
      campaignStatus: "none"
    },
    ...overrides
  };
}

describe("revenue intelligence and outreach safety foundation", () => {
  it("defines a structured first offer without making outreach live", () => {
    expect(offer).toMatchObject({
      productKey: "noticecontrol_contract_intelligence",
      status: "foundation_only",
      complianceSensitivity: "moderate",
      supportedMarkets: ["global"],
      supportedLanguages: ["en"]
    });
    expect(offer.valuePropositions.join(" ")).toContain("renewal-control");
    expect(offer.toneGuidance.join(" ")).toMatch(/no legal advice/i);
  });

  it("scores ICP fit from evidence without inventing facts", () => {
    const strongFit = explainIcpFit(icp, {
      companyName: "Acme Operations",
      domain: "acme.example",
      countryOrMarket: "global",
      industry: "software",
      companySize: "50-500",
      buyerRole: "operations",
      seniority: "director",
      department: "operations",
      painPoints: ["missed renewal notices", "spreadsheet owner tracking"],
      triggerEvents: ["vendor consolidation"],
      sourceUrls: ["https://acme.example/team"]
    });

    expect(strongFit.fit).toBe("strong_fit");
    expect(strongFit.matchedEvidence).toEqual(
      expect.arrayContaining(["industry", "company_size", "market", "buyer_role", "pain_point"])
    );
    expect(strongFit.missingEvidence).toEqual([]);

    const notFit = explainIcpFit(icp, {
      companyName: "Consumer Student Club",
      countryOrMarket: "global",
      sourceText: "student job seeker consumer forum"
    });

    expect(notFit.fit).toBe("not_fit");
    expect(notFit.disqualifyingEvidence).toEqual(expect.arrayContaining(["student", "consumer", "job seeker"]));
    expect(notFit.missingEvidence).toEqual(expect.arrayContaining(["domain", "buyerRole", "sourceUrls"]));
  });

  it("classifies lead eligibility with explicit audit-friendly reasons", () => {
    expect(classifyLeadEligibility(eligibleLead())).toMatchObject({
      status: "eligible",
      reasonCodes: ["eligible"]
    });

    expect(
      classifyLeadEligibility(
        eligibleLead({
          evidence: { sourceUrl: null, sourceText: null },
          compliance: { legalBasis: "unknown" }
        })
      )
    ).toMatchObject({
      status: "needs_review",
      reasonCodes: expect.arrayContaining(["source_evidence_missing", "legal_basis_missing"])
    });

    expect(
      classifyLeadEligibility(
        eligibleLead({
          compliance: { legalBasis: "business_legitimate_interest", optOutSuppressed: true }
        })
      )
    ).toMatchObject({
      status: "blocked",
      reasonCodes: expect.arrayContaining(["suppression_or_opt_out"])
    });
  });

  it("applies outreach compliance gates before generation or export", () => {
    expect(evaluateOutreachCompliance({ offer, lead: eligibleLead(), marketId: "global" })).toMatchObject({
      decision: "allow",
      reasonCodes: ["allowed"],
      auditMetadata: {
        product_key: "noticecontrol_contract_intelligence",
        market_id: "global",
        decision: "allow"
      }
    });

    expect(
      evaluateOutreachCompliance({
        offer,
        lead: eligibleLead({ lead: { recipientType: "unknown" } }),
        marketId: "global"
      })
    ).toMatchObject({
      decision: "review",
      reasonCodes: expect.arrayContaining(["recipient_type_review_required"])
    });

    expect(
      evaluateOutreachCompliance({
        offer,
        lead: eligibleLead({
          compliance: { legalBasis: "business_legitimate_interest", optOutSuppressed: true }
        }),
        marketId: "global"
      })
    ).toMatchObject({
      decision: "block",
      reasonCodes: expect.arrayContaining(["suppression_or_opt_out"])
    });
  });

  it("blocks restricted markets and does not treat planned markets as active outreach markets", () => {
    expect(evaluateOutreachCompliance({ offer, lead: eligibleLead(), marketId: "eu" })).toMatchObject({
      decision: "review",
      reasonCodes: expect.arrayContaining(["market_not_shipped"])
    });

    expect(
      evaluateOutreachCompliance({
        offer,
        lead: eligibleLead(),
        marketId: "restricted_market_review"
      })
    ).toMatchObject({
      decision: "block",
      reasonCodes: expect.arrayContaining(["restricted_market_outreach_blocked", "outreach_mode_not_allowed"])
    });

    expect(canSelfServeActivateMarket("restricted_market_review")).toMatchObject({
      allowed: false,
      reason: "compliance_review_required"
    });
    expect(MARKET_PROFILES.restricted_market_review.allowedOutreachModes).toEqual([]);
  });

  it("requires compliance, QA, and human approval before export", () => {
    expect(
      evaluateOutreachApprovalTransition({
        from: "draft_generated",
        to: "exported",
        complianceDecision: "allow",
        qaPassed: true,
        humanApproved: true
      })
    ).toMatchObject({ allowed: false, reason: "unsupported_transition" });

    expect(
      evaluateOutreachApprovalTransition({
        from: "needs_human_review",
        to: "approved_for_export",
        complianceDecision: "review",
        qaPassed: true,
        humanApproved: true
      })
    ).toMatchObject({ allowed: false, reason: "compliance_must_pass" });

    expect(
      evaluateOutreachApprovalTransition({
        from: "needs_human_review",
        to: "approved_for_export",
        complianceDecision: "allow",
        qaPassed: false,
        humanApproved: true
      })
    ).toMatchObject({ allowed: false, reason: "qa_must_pass" });

    expect(
      evaluateOutreachApprovalTransition({
        from: "needs_human_review",
        to: "approved_for_export",
        complianceDecision: "allow",
        qaPassed: true,
        humanApproved: true
      })
    ).toMatchObject({ allowed: true });

    expect(canExportOutreach({ approvalState: "approved_for_export", complianceDecision: "allow", humanApproved: true })).toBe(true);
    expect(canExportOutreach({ approvalState: "draft_generated", complianceDecision: "allow", humanApproved: true })).toBe(false);
  });

  it("documents the future-only revenue intelligence and market expansion boundary", () => {
    const doc = readRepoFile("docs", "REVENUE_INTELLIGENCE_MARKET_EXPANSION_BOUNDARY.md");
    const marketDoc = readRepoFile("docs", "MARKET_EXPANSION_BOUNDARY.md");
    const combined = `${doc}\n${marketDoc}`;

    expect(combined).toContain("not a mass email");
    expect(combined).toContain("Human approval is required");
    expect(combined).toContain("Compliance gate comes before generation or export");
    expect(combined).toContain("not sanctions evasion");
    expect(combined).toContain("global/default");
    expect(combined).not.toMatch(/automated sending is shipped/i);
  });
});
