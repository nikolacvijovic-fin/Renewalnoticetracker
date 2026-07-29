import type { CommercialDecision } from "@/lib/commercial-decision-workbench/decision-types";
import type { NegotiationBrief } from "@/lib/negotiation-workflow/negotiation-types";
import type {
  RenewalQuoteComparison,
  RenewalQuoteFinding,
  SavingsOpportunity
} from "@/lib/quote-comparison/quote-types";
import type {
  OutreachAudience,
  OutreachChannel,
  OutreachOpportunityDetection,
  OutreachOpportunityType,
  OutreachPriority
} from "@/lib/internal-outreach-intelligence/outreach-types";

function priorityFromRisk(risk: string | null | undefined): OutreachPriority {
  if (risk === "critical") return "critical";
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  return "low";
}

function confidence(values: Array<number | null | undefined>) {
  const usable = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!usable.length) return 0;
  return Number((usable.reduce((sum, value) => sum + value, 0) / usable.length).toFixed(2));
}

function opportunity(input: {
  opportunityType: OutreachOpportunityType;
  priority: OutreachPriority;
  audience: OutreachAudience;
  recommendedChannel?: OutreachChannel;
  reasonSummary: string;
  evidenceConfidence: number;
  expectedCommercialImpact?: Record<string, unknown>;
  dueDate?: string | null;
  renewalDeadline?: string | null;
  blockerCodes?: string[];
  warningCodes?: string[];
  safetyReasons?: string[];
  evidenceLinks?: OutreachOpportunityDetection["evidenceLinks"];
}): OutreachOpportunityDetection {
  const safetyReasons = input.safetyReasons ?? [];
  return {
    opportunityType: input.opportunityType,
    priority: input.priority,
    audience: input.audience,
    recommendedChannel: input.recommendedChannel ?? "internal_note",
    reasonSummary: input.reasonSummary,
    evidenceConfidence: input.evidenceConfidence,
    expectedCommercialImpact: input.expectedCommercialImpact ?? {},
    dueDate: input.dueDate ?? null,
    renewalDeadline: input.renewalDeadline ?? null,
    blockerCodes: input.blockerCodes ?? [],
    warningCodes: input.warningCodes ?? [],
    safetyStatus: safetyReasons.length ? "needs_review" : "safe",
    safetyReasons,
    evidenceLinks: input.evidenceLinks ?? []
  } as OutreachOpportunityDetection;
}

export function detectInternalOutreachOpportunities(input: {
  decision?: CommercialDecision | null;
  quoteComparison?: RenewalQuoteComparison | null;
  quoteFindings?: RenewalQuoteFinding[];
  savingsOpportunities?: SavingsOpportunity[];
  negotiationBrief?: NegotiationBrief | null;
  contract?: {
    id: string;
    owner_user_id?: string | null;
    counterparty_name?: string | null;
    contract_metadata?: {
      vendor_name?: string | null;
      category?: string | null;
      renewal_date?: string | null;
      notice_deadline_date?: string | null;
      has_weak_evidence?: boolean | null;
      needs_review?: boolean | null;
      contract_value_amount?: number | null;
      contract_value_currency?: string | null;
    } | null;
  } | null;
  vendorContractCount?: number;
}) {
  const findings = input.quoteFindings ?? [];
  const savings = input.savingsOpportunities ?? [];
  const results: OutreachOpportunityDetection[] = [];
  const decision = input.decision ?? null;
  const metadata = input.contract?.contract_metadata ?? null;
  const renewalDeadline = decision?.renewal_deadline ?? metadata?.renewal_date ?? null;
  const dueDate = decision?.notice_deadline ?? metadata?.notice_deadline_date ?? renewalDeadline;

  if (decision && ["critical", "high"].includes(decision.commercial_risk_level)) {
    results.push(opportunity({
      opportunityType: "renewal_risk",
      priority: priorityFromRisk(decision.commercial_risk_level),
      audience: "internal_owner",
      recommendedChannel: "internal_email",
      reasonSummary: `Commercial decision is ${decision.commercial_risk_level} risk and recommends ${decision.recommended_action.replaceAll("_", " ")}.`,
      evidenceConfidence: decision.evidence_confidence,
      expectedCommercialImpact: {
        estimatedSavingsAmount: decision.estimated_savings_amount,
        currency: decision.currency,
        recommendedAction: decision.recommended_action
      },
      dueDate,
      renewalDeadline,
      blockerCodes: decision.blocker_codes,
      warningCodes: decision.warning_codes,
      evidenceLinks: [{
        evidenceType: "commercial_decision",
        evidenceId: decision.id,
        evidenceLabel: "Commercial decision risk trigger",
        confidence: decision.evidence_confidence,
        metadata: { recommendedAction: decision.recommended_action, riskLevel: decision.commercial_risk_level }
      }]
    }));
  }

  const priceIncreaseFindings = findings.filter((finding) => finding.finding_type === "price_increase" && finding.status !== "dismissed");
  if (priceIncreaseFindings.length) {
    results.push(opportunity({
      opportunityType: "price_increase",
      priority: priceIncreaseFindings.some((finding) => finding.severity === "critical") ? "critical" : "high",
      audience: "procurement",
      recommendedChannel: "internal_email",
      reasonSummary: "Renewal quote includes a price increase that should be reviewed before approval.",
      evidenceConfidence: confidence(priceIncreaseFindings.map((finding) => finding.confidence)),
      expectedCommercialImpact: {
        priceDeltaPercent: input.quoteComparison?.price_delta_percent ?? null,
        priceDeltaAmount: input.quoteComparison?.price_delta_amount ?? null,
        currency: input.quoteComparison?.currency ?? decision?.currency ?? null
      },
      dueDate,
      renewalDeadline,
      evidenceLinks: priceIncreaseFindings.map((finding) => ({
        evidenceType: "renewal_quote_finding",
        evidenceId: finding.id,
        evidenceLabel: `Quote finding: ${finding.finding_type}`,
        confidence: finding.confidence,
        metadata: { severity: finding.severity }
      }))
    }));
  }

  const acceptedSavings = savings.filter((item) => ["accepted", "open", "in_review"].includes(item.status));
  if (acceptedSavings.length) {
    const best = acceptedSavings.reduce((previous, current) =>
      (current.estimated_savings_amount ?? 0) > (previous.estimated_savings_amount ?? 0) ? current : previous
    );
    results.push(opportunity({
      opportunityType: "savings_opportunity",
      priority: (best.estimated_savings_amount ?? 0) >= 10000 ? "high" : "medium",
      audience: "finance",
      recommendedChannel: "internal_email",
      reasonSummary: "Savings opportunity is available and should be routed to finance/procurement review.",
      evidenceConfidence: confidence(acceptedSavings.map((item) => item.confidence)),
      expectedCommercialImpact: {
        estimatedSavingsAmount: best.estimated_savings_amount,
        currency: best.currency
      },
      dueDate,
      renewalDeadline,
      evidenceLinks: acceptedSavings.map((item) => ({
        evidenceType: "savings_opportunity",
        evidenceId: item.id,
        evidenceLabel: `Savings opportunity: ${item.opportunity_type}`,
        confidence: item.confidence,
        metadata: { status: item.status, estimatedSavingsAmount: item.estimated_savings_amount, currency: item.currency }
      }))
    }));
  }

  if (decision?.negotiation_posture === "legal_review_required" || decision?.blocker_codes.includes("expired_notice_deadline")) {
    results.push(opportunity({
      opportunityType: "legal_review",
      priority: decision.blocker_codes.includes("expired_notice_deadline") ? "critical" : "high",
      audience: "legal",
      recommendedChannel: "internal_email",
      reasonSummary: "Legal review is needed before external vendor communication or renewal commitment.",
      evidenceConfidence: decision.evidence_confidence,
      dueDate,
      renewalDeadline,
      blockerCodes: decision.blocker_codes,
      warningCodes: decision.warning_codes,
      safetyReasons: ["legal_review_required"],
      evidenceLinks: [{
        evidenceType: "commercial_decision",
        evidenceId: decision.id,
        evidenceLabel: "Legal-review commercial decision trigger",
        confidence: decision.evidence_confidence
      }]
    }));
  }

  if (!input.contract?.owner_user_id || decision?.blocker_codes.includes("missing_owner")) {
    results.push(opportunity({
      opportunityType: "stakeholder_review",
      priority: "high",
      audience: "stakeholder_group",
      recommendedChannel: "internal_note",
      reasonSummary: "Contract owner is missing; assign an internal stakeholder before relying on renewal workflow.",
      evidenceConfidence: decision?.evidence_confidence ?? 0.8,
      dueDate,
      renewalDeadline,
      blockerCodes: ["missing_owner"],
      evidenceLinks: [{
        evidenceType: "contract_metadata",
        evidenceId: input.contract?.id ?? null,
        evidenceLabel: "Missing owner assignment"
      }]
    }));
  }

  if ((input.vendorContractCount ?? 0) >= 3) {
    results.push(opportunity({
      opportunityType: "vendor_consolidation",
      priority: "medium",
      audience: "procurement",
      recommendedChannel: "meeting_agenda",
      reasonSummary: "Multiple contracts share the same vendor/category and may justify consolidation review.",
      evidenceConfidence: 0.75,
      expectedCommercialImpact: { vendorContractCount: input.vendorContractCount },
      dueDate,
      renewalDeadline,
      evidenceLinks: [{
        evidenceType: "contract_metadata",
        evidenceId: input.contract?.id ?? null,
        evidenceLabel: "Vendor/category consolidation signal",
        metadata: { vendorContractCount: input.vendorContractCount }
      }]
    }));
  }

  if (metadata?.has_weak_evidence || metadata?.needs_review || decision?.warning_codes.includes("weak_contract_evidence")) {
    results.push(opportunity({
      opportunityType: "contract_cleanup",
      priority: "medium",
      audience: "internal_owner",
      recommendedChannel: "internal_note",
      reasonSummary: "Contract evidence needs cleanup before confident outreach or renewal approval.",
      evidenceConfidence: decision?.evidence_confidence ?? 0.5,
      dueDate,
      renewalDeadline,
      warningCodes: ["weak_contract_evidence"],
      safetyReasons: ["evidence_review_required"],
      evidenceLinks: [{
        evidenceType: "contract_metadata",
        evidenceId: input.contract?.id ?? null,
        evidenceLabel: "Weak evidence cleanup signal"
      }]
    }));
  }

  if (input.negotiationBrief?.status === "approved") {
    results.push(opportunity({
      opportunityType: "negotiation_follow_up",
      priority: input.negotiationBrief.strategy === "escalate_to_legal" ? "critical" : "high",
      audience: "procurement",
      recommendedChannel: "internal_email",
      reasonSummary: `Approved negotiation brief is ready for controlled internal follow-up: ${input.negotiationBrief.strategy.replaceAll("_", " ")}.`,
      evidenceConfidence: input.negotiationBrief.confidence_score,
      dueDate,
      renewalDeadline,
      evidenceLinks: [{
        evidenceType: "negotiation_brief",
        evidenceId: input.negotiationBrief.id,
        evidenceLabel: "Approved negotiation brief",
        confidence: input.negotiationBrief.confidence_score,
        metadata: { strategy: input.negotiationBrief.strategy }
      }]
    }));
  }

  return results;
}
