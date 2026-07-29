import type {
  InternalOutreachDraft,
  InternalOutreachEvidenceLink,
  InternalOutreachOpportunity,
  InternalOutreachSuppression,
  OutreachPriorityBand,
  OutreachPriorityScore
} from "@/lib/internal-outreach-intelligence/outreach-types";
import { isSuppressionActive } from "@/lib/internal-outreach-intelligence/outreach-safety";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysUntil(date: string | null, now: Date) {
  if (!date) return null;
  const time = new Date(date).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.ceil((time - now.getTime()) / (24 * 60 * 60 * 1000));
}

function bandFromScore(score: number): OutreachPriorityBand {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function numberFromImpact(impact: unknown, keys: string[]) {
  if (!impact || typeof impact !== "object") return 0;
  const record = impact as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.abs(value);
  }
  return 0;
}

export function scoreOutreachOpportunity(input: {
  opportunity: InternalOutreachOpportunity;
  drafts?: InternalOutreachDraft[];
  evidenceLinks?: InternalOutreachEvidenceLink[];
  suppressions?: InternalOutreachSuppression[];
  now?: Date;
}): OutreachPriorityScore {
  const { opportunity } = input;
  const now = input.now ?? new Date();
  const activeSuppression = (input.suppressions ?? []).some(isSuppressionActive);
  if (activeSuppression || opportunity.safety_status === "blocked") {
    return {
      priorityScore: 0,
      priorityBand: "blocked",
      urgencyReason: activeSuppression ? "Active suppression blocks outreach." : "Safety review blocks outreach.",
      commercialReason: "Outreach cannot proceed until blockers are resolved.",
      nextBestAction: "Resolve suppression or safety blockers before drafting.",
      confidenceScore: Math.round(opportunity.evidence_confidence * 100),
      scoringBreakdown: {
        suppression: activeSuppression ? -100 : 0,
        safety: opportunity.safety_status === "blocked" ? -100 : 0
      }
    };
  }

  const daysToDueDate = daysUntil(opportunity.due_date, now);
  const daysToRenewal = daysUntil(opportunity.renewal_deadline, now);
  const impactAmount = numberFromImpact(opportunity.expected_commercial_impact, [
    "estimatedSavingsAmount",
    "priceDeltaAmount",
    "contractValueAmount"
  ]);
  const approvedDraft = (input.drafts ?? []).some((draft) => draft.status === "approved_for_copy");
  const evidenceCount = input.evidenceLinks?.length ?? 0;
  const breakdown = {
    commercialImpact: impactAmount >= 50000 ? 25 : impactAmount >= 10000 ? 18 : impactAmount > 0 ? 10 : 4,
    urgency:
      daysToDueDate !== null && daysToDueDate < 0
        ? 30
        : daysToDueDate !== null && daysToDueDate <= 14
          ? 25
          : daysToRenewal !== null && daysToRenewal <= 30
            ? 20
            : daysToRenewal !== null && daysToRenewal <= 60
              ? 12
              : 5,
    evidenceConfidence: Math.round(opportunity.evidence_confidence * 20),
    quoteSeverity: opportunity.opportunity_type === "price_increase" && opportunity.priority === "critical" ? 15 : opportunity.opportunity_type === "price_increase" ? 10 : 0,
    decisionRisk: opportunity.priority === "critical" ? 15 : opportunity.priority === "high" ? 10 : opportunity.priority === "medium" ? 5 : 0,
    negotiationStatus: opportunity.opportunity_type === "negotiation_follow_up" ? 12 : 0,
    stakeholderCompleteness: opportunity.owner_user_id ? 5 : -10,
    evidenceCoverage: evidenceCount > 0 ? 5 : -8,
    readyDraft: approvedDraft ? 8 : 0,
    safety: opportunity.safety_status === "needs_review" ? -8 : 0
  };
  const score = clampScore(Object.values(breakdown).reduce((sum, value) => sum + value, 0));
  const priorityBand = bandFromScore(score);
  const urgencyReason =
    daysToDueDate !== null && daysToDueDate < 0
      ? "Notice deadline has already passed."
      : daysToDueDate !== null && daysToDueDate <= 14
        ? `Notice deadline is in ${daysToDueDate} days.`
        : daysToRenewal !== null && daysToRenewal <= 30
          ? `Renewal is in ${daysToRenewal} days.`
          : "No immediate notice-window urgency detected.";
  const commercialReason =
    impactAmount > 0
      ? `Evidence-backed commercial impact is approximately ${impactAmount}.`
      : `${opportunity.opportunity_type.replaceAll("_", " ")} requires internal review.`;
  const nextBestAction =
    opportunity.safety_status === "needs_review"
      ? "Resolve safety review warnings before approval."
      : approvedDraft
        ? "Manually copy the approved draft into the appropriate internal system."
        : "Generate or route the internal draft for approval.";

  return {
    priorityScore: score,
    priorityBand,
    urgencyReason,
    commercialReason,
    nextBestAction,
    confidenceScore: clampScore(opportunity.evidence_confidence * 100),
    scoringBreakdown: breakdown
  };
}
