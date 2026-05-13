export type AnalyticsBlueprintSection = {
  title: string;
  summary: string;
  items: string[];
};

export type UnifiedAnalyticsBlueprint = {
  northStar: AnalyticsBlueprintSection;
  activationModel: AnalyticsBlueprintSection;
  retentionModel: AnalyticsBlueprintSection;
  eventTaxonomy: AnalyticsBlueprintSection;
  kpiHierarchy: AnalyticsBlueprintSection;
  dashboardSystem: AnalyticsBlueprintSection;
  warningThresholds: AnalyticsBlueprintSection;
  implementationOrder: AnalyticsBlueprintSection;
  dataQualityRules: AnalyticsBlueprintSection;
  topNextActions: AnalyticsBlueprintSection;
};

export const unifiedAnalyticsBlueprint: UnifiedAnalyticsBlueprint = {
  northStar: {
    title: "North star",
    summary:
      "The system should optimize for trusted renewal control in paying workspaces, not raw activity or storage.",
    items: [
      "North star: active tracked contracts in paying workspaces where review is completed, an owner is assigned, and at least one live renewal or notice obligation is surfaced.",
      "This keeps analytics tied to the wedge: renewal control, accountability, reminders, visibility, and action.",
      "Do not substitute stored contracts, reminder volume, or generic active users for this metric."
    ]
  },
  activationModel: {
    title: "Activation model",
    summary:
      "Activation is the point where the product becomes operationally trustworthy and worth paying for.",
    items: [
      "Activation definition: at least one contract uploaded or created, reviewed, assigned to an owner, and tied to a live reminder-backed obligation.",
      "First value comes before payment: one reviewed, owned, visible obligation.",
      "First paid value comes after workflow depth: natural pressure from contract-band, coordination, or reporting needs.",
      "Track the full activation funnel: signup -> first upload/import -> first review -> first owner -> first reminder -> first visible obligation."
    ]
  },
  retentionModel: {
    title: "Retention model",
    summary:
      "Retention should be measured as ongoing workflow embedding, not passive account existence.",
    items: [
      "Retained account = a paying workspace that maintains or expands trusted contract coverage and keeps using review, owners, reminders, decisions, or operational views.",
      "Active account = meaningful workflow action in the last 7 or 30 days, not just login.",
      "Healthy retention signals: high reviewed coverage, strong owner coverage, reminder continuity, due-soon decision discipline, and expanding portfolio coverage.",
      "Churn-warning signals: no review after upload, owner gaps, decision gaps, stagnant coverage, reliability pain, and billing-portal activity from shallow accounts."
    ]
  },
  eventTaxonomy: {
    title: "Event taxonomy",
    summary:
      "The event model should be narrow, canonical, and centered on workflow milestones, monetization moments, and trust events.",
    items: [
      "Core categories: auth, onboarding, contract creation, upload, extraction, review, ownership, reminders, rules/escalations, playbooks, decisions, exports, digest, billing, pricing, upgrade prompts, admin/debug, errors/failures, inactivity/churn signals.",
      "Every meaningful event should include organization_id; commercial events should include plan_tier and source where possible.",
      "Critical server-side source-of-truth events: billing changes, import outcomes, review completion, owner assignment writes, reminder send outcomes, renewal decisions, extraction outcomes, admin rescue actions.",
      "Client-side events should mainly capture funnel context: pricing views, prompt views/clicks, gate views/clicks, and workflow-view revisits."
    ]
  },
  kpiHierarchy: {
    title: "KPI hierarchy",
    summary:
      "The KPI system should flow from value creation to monetization to retention to margin, with no vanity in the middle.",
    items: [
      "Top layer: north star, activation rate, WAO/MAO, gross retention, net retention, gross margin by segment.",
      "Product layer: reviewed-contract rate, owner-assignment rate, reminder-coverage rate, review completion rate, time to trusted contract.",
      "Commercial layer: pricing page to signup, activation to paid, upgrade conversion, paid activation, expansion rate, plan mix by MRR.",
      "CS layer: unhealthy-account rate, account health score bands, churn-risk signals, expansion-ready accounts.",
      "Reliability layer: reminder send success, extraction failure rate, low-confidence extraction rate, wrong-behavior incidents."
    ]
  },
  dashboardSystem: {
    title: "Dashboard system",
    summary:
      "Dashboards should exist to drive weekly decisions, not to display everything that can be counted.",
    items: [
      "Founder / Executive: revenue quality, segment profitability, retention quality, and margin risk.",
      "Product: activation funnel, workflow drop-off, trust depth, and feature adoption tied to retention.",
      "Growth / Revenue: pricing funnel, upgrade triggers, commercial gate conversion, checkout leakage, and plan mix.",
      "Retention / Customer Success: account health, onboarding rescue, churn risk, reliability pain, and expansion readiness.",
      "Support / Operations: support burden, onboarding burden, rescue volume, and automation priorities.",
      "Reliability / Trust: reminder delivery, retries, cron lag, extraction quality, review backlog, and wrong-behavior risk."
    ]
  },
  warningThresholds: {
    title: "Warning thresholds",
    summary:
      "Thresholds should focus on deterioration that changes operating behavior, not arbitrary target chasing.",
    items: [
      "Reminder delivery success below 98 percent is warning; below 95 percent is critical.",
      "Gross margin below 75 percent by segment is warning; below 65 percent is critical.",
      "Support cost above 15 percent of ACV is warning; above 25 percent is critical.",
      "Payback above 12 months is warning; above 18 months is critical.",
      "At-risk or unhealthy-account rate rising across cohorts should trigger CS and product review.",
      "Commercial gates shown often but rarely clicked or converted should trigger pricing/packaging review."
    ]
  },
  implementationOrder: {
    title: "Implementation order",
    summary:
      "Implementation should start with the metrics and events that most directly affect activation, revenue, retention, and margin.",
    items: [
      "First: instrument the activation path, core commercial path, and reliability-critical workflow events.",
      "Second: add support time, onboarding time, extraction cost, notification cost, and rescue logging.",
      "Third: build derived health and profitability snapshots and the founder/product/growth dashboards.",
      "Fourth: add CS health queues, source-to-margin attribution, and stronger churn-warning models.",
      "Fifth: expand into richer anomaly detection and advanced segmentation only after the core system is trusted."
    ]
  },
  dataQualityRules: {
    title: "Data quality rules",
    summary:
      "The analytics system should prefer fewer trusted metrics over a wider field of noisy ones.",
    items: [
      "Use one canonical event schema with event_version and idempotency_key.",
      "Keep common dimensions like organization_id, plan_tier, source, entity_type, and entity_id as top-level fields.",
      "Version metric definitions and snapshot logic whenever semantics change.",
      "Do not trust health or profitability scores without complete underlying signal coverage.",
      "Deduplicate retry-prone flows like billing, imports, reminders, and cron jobs using canonical idempotency rules.",
      "Track support and onboarding effort by organization_id or the margin model will be fiction."
    ]
  },
  topNextActions: {
    title: "Top 10 next actions",
    summary:
      "The next actions should tighten measurement around the wedge and eliminate the biggest blind spots first.",
    items: [
      "Instrument the full signup-to-first-value funnel server-side where possible.",
      "Make workflow-view and abandonment signals strong enough to catch weak retention early.",
      "Complete support time and onboarding time logging.",
      "Capture extraction and notification cost at the organization level.",
      "Build organization_health_snapshots and organization_profitability_snapshots.",
      "Ship the Founder / Executive dashboard first, then Product, then Growth.",
      "Add health-score confidence flags so CS does not overtrust incomplete data.",
      "Audit all current metrics and remove any that do not support a real decision.",
      "Backfill source attribution into derived profitability tables.",
      "Set a weekly operating review for activation, retention, margin, and reliability based on the canonical dashboards."
    ]
  }
};
