import { analyticsEventCatalog, profitabilityMetrics } from "@/lib/commercial/analytics";
import { conversionAnalysis } from "@/lib/commercial/conversion";
import { gtmAnalysis } from "@/lib/commercial/gtm";
import { marginAnalysis } from "@/lib/commercial/margin";
import { packagingCategories, pricingAnchors } from "@/lib/commercial/packaging";
import { redTeamAnalysis, redTeamRisks } from "@/lib/commercial/red-team";
import { retentionAnalysis, retentionLoops, retentionMetrics } from "@/lib/commercial/retention";
import { pricingPlans, servicePackages, serviceStrategy } from "@/lib/commercial/strategy";
import { unitEconomicsAnalysis, unitEconomicsSegments } from "@/lib/commercial/unit-economics";

export type UnifiedBlueprintSection = {
  title: string;
  summary: string;
  bullets: string[];
};

export type UnifiedProfitabilityBlueprint = {
  targetCustomer: UnifiedBlueprintSection;
  pricingModel: UnifiedBlueprintSection;
  packagingStructure: UnifiedBlueprintSection;
  upgradeTriggers: UnifiedBlueprintSection;
  conversionFlow: UnifiedBlueprintSection;
  retentionLogic: UnifiedBlueprintSection;
  addOnsServices: UnifiedBlueprintSection;
  analyticsSystem: UnifiedBlueprintSection;
  unitEconomicsLogic: UnifiedBlueprintSection;
  costControlPriorities: UnifiedBlueprintSection;
  mainRisks: UnifiedBlueprintSection;
  topNextActions: UnifiedBlueprintSection;
};

export const unifiedProfitabilityBlueprint: UnifiedProfitabilityBlueprint = {
  targetCustomer: {
    title: "Target customer",
    summary:
      "The best business is built around ops-led SMB and midsize teams with real renewal exposure, meaningful contract volume, and moderate complexity.",
    bullets: [
      `Best ICP: ${gtmAnalysis.mostProfitableIcp}`,
      `Easiest to close: ${gtmAnalysis.easiestToCloseIcp}`,
      `Lowest churn profile: ${gtmAnalysis.leastLikelyToChurnIcp}`,
      `Best economic segment: ${unitEconomicsAnalysis.bestTargetSegmentEconomically}`,
      "Disqualify tiny low-urgency teams and enterprise-lite CLM seekers early."
    ]
  },
  pricingModel: {
    title: "Pricing model",
    summary:
      "Price the product like renewal risk-control software, not seat-based utility software. The right model is workspace plus active tracked contract bands plus generous included editors.",
    bullets: [
      "Recommended model: workspace + active tracked contract bands + included editor seats",
      ...pricingPlans.map(
        (plan) => `${plan.name}: ${plan.price}${plan.cadence} - ${plan.contractBand}`
      ),
      `Primary value metric: ${"active tracked contracts"}`,
      "Monthly should stay available, but Growth and Portfolio should be pushed annual-first.",
      ...pricingAnchors.slice(0, 2)
    ]
  },
  packagingStructure: {
    title: "Packaging structure",
    summary:
      "Keep the wedge strong in Entry, monetize coordination depth in Growth, and reserve governance and security for the top tier.",
    bullets: [
      "Entry should include upload, extraction, review, owner assignment, renewal decisions, single-recipient reminders, dashboard visibility, import/export, and templates.",
      "Growth should separate on multi-recipient reminders, escalations, Slack/Teams delivery, playbooks, broader team coordination, and deeper admin control.",
      "Portfolio should monetize custom contract bands, SSO, governance, approvals, and guided rollout without drifting into CLM.",
      ...packagingCategories.map(
        (category) => `${category.label}: ${category.critique}`
      )
    ]
  },
  upgradeTriggers: {
    title: "Upgrade triggers",
    summary:
      "The best upgrade pressure appears when the workflow expands: more tracked contracts, more stakeholders, more routing, more reporting, and more governance.",
    bullets: [
      ...conversionAnalysis.upgradePromptMoments,
      "Approaching the active tracked contract cap",
      "Cross-department rollout needing more editors and ownership depth",
      "Executive reporting and quarterly review expectations"
    ]
  },
  conversionFlow: {
    title: "Conversion flow",
    summary:
      "Do not ask for money before the buyer sees one contract become a trusted, owned, visible obligation. Conversion should follow first value, not precede it.",
    bullets: [
      `Value becomes real: ${conversionAnalysis.valueBecomesReal}`,
      `First-value milestone: ${conversionAnalysis.firstValueMilestone}`,
      `First paid-value milestone: ${conversionAnalysis.firstPaidValueMilestone}`,
      ...conversionAnalysis.firstSessionPrinciples,
      conversionAnalysis.beforeAskingForMoney,
      `Best trial motion: ${conversionAnalysis.bestTrialRecommendation}`
    ]
  },
  retentionLogic: {
    title: "Retention logic",
    summary:
      "Retention comes from recurring operational review, not from reminders alone. The product has to become the weekly place where owners, deadlines, and decisions are reviewed.",
    bullets: [
      `Recurring workflow: ${retentionAnalysis.recurringWorkflow}`,
      `Stickiness: ${retentionAnalysis.stickiness}`,
      ...retentionLoops.reminderDriven.map((loop) => `${loop.name}: ${loop.retentionImpact}`),
      ...retentionLoops.ownershipAccountability.map(
        (loop) => `${loop.name}: ${loop.retentionImpact}`
      ),
      ...retentionLoops.reporting.map((loop) => `${loop.name}: ${loop.retentionImpact}`),
      ...retentionMetrics.weekly.slice(0, 3).map((metric) => `Weekly watch: ${metric}`)
    ]
  },
  addOnsServices: {
    title: "Add-ons and services",
    summary:
      "Services should accelerate onboarding, coverage, and operational depth. They should never become open-ended contract operations consulting.",
    bullets: [
      ...servicePackages.map(
        (service) =>
          `${service.name}: ${service.deliveryModel === "recurring" ? "Recurring" : "One-time"} for ${service.targetBuyer}`
      ),
      `Offer early: ${serviceStrategy.earlyServices.join(", ")}`,
      `Productize later: ${serviceStrategy.productizeLater.join(", ")}`,
      `Never offer: ${serviceStrategy.neverOffer.slice(0, 3).join(", ")}`
    ]
  },
  analyticsSystem: {
    title: "Analytics system",
    summary:
      "The business should be run on commercial depth, margin quality, and workflow embedding. Raw signups and generic activity are not enough.",
    bullets: [
      `North star: ${profitabilityMetrics[0]?.northStar ?? ""}`,
      `Activation: ${profitabilityMetrics[0]?.activation ?? ""}`,
      "Track pricing page -> signup -> trial -> first upload -> first review -> first owner -> first reminder -> checkout -> paid.",
      `Key dashboards: founder, product, growth, finance, customer success, support/operations`,
      `Critical events: ${analyticsEventCatalog
        .slice(0, 6)
        .map((event) => event.eventName)
        .join(", ")}`
    ]
  },
  unitEconomicsLogic: {
    title: "Unit economics logic",
    summary:
      "The model works when meaningful contract portfolios convert to paid plans quickly, onboarding is scoped, support stays disciplined, and expansion follows contract coverage plus coordination depth.",
    bullets: [
      ...unitEconomicsSegments.map(
        (segment) => `${segment.name}: ${segment.likelyAcvRange} ACV, ${segment.economicQuality} economics`
      ),
      unitEconomicsAnalysis.paybackConsiderations,
      unitEconomicsAnalysis.ltvConsiderations,
      `Data to collect next: ${unitEconomicsAnalysis.dataToCollect.slice(0, 5).join(", ")}`
    ]
  },
  costControlPriorities: {
    title: "Cost-control priorities",
    summary:
      "Protect gross margin by charging for messy setup work, automating repetitive support, and refusing customers or features that push the product toward low-margin operations.",
    bullets: [
      `Biggest cost leaks: ${marginAnalysis.biggestCostLeaks.join(", ")}`,
      `Automate first: ${marginAnalysis.automateFirst.join(", ")}`,
      `Acceptable manual early: ${marginAnalysis.acceptableManualEarly.join(", ")}`,
      `Dangerous manual later: ${marginAnalysis.dangerousManualLater.join(", ")}`,
      `Cut to protect margin: ${marginAnalysis.cutToProtectMargin.join(", ")}`
    ]
  },
  mainRisks: {
    title: "Main risks",
    summary:
      "The biggest danger is building something commercially impressive but economically soft: too much support load, too many low-fit customers, and too much faith in surface usage.",
    bullets: [
      redTeamAnalysis.brutalCritique,
      ...redTeamRisks.map((risk) => `${risk.title}: ${risk.critique}`),
      `Must change: ${redTeamAnalysis.mustChange.join(", ")}`
    ]
  },
  topNextActions: {
    title: "Top 10 next actions",
    summary:
      "The next steps should tighten execution around monetization, activation, retention, and margin quality instead of adding more product surface area.",
    bullets: [
      "Ship in-product trial-expiry prompts tied to activation state.",
      "Instrument source-to-paid funnel and commercial gate performance end to end.",
      "Add account health scoring to customer success and admin workflows.",
      "Track extraction cost, support hours, and onboarding effort per account.",
      "Sell onboarding, import cleanup, and workflow setup as scoped paid packages by default.",
      "Tighten Growth upgrade pressure around coordination depth and contract-band expansion.",
      "Create partner-led referral motion with fractional CFO and procurement operators.",
      "Build founder and finance dashboards around margin by segment, not just revenue.",
      "Disqualify low-fit tiny accounts and CLM-seeking enterprise buyers faster.",
      "Freeze roadmap against drafting, negotiation, approval-sprawl, and other CLM drift."
    ]
  }
};
