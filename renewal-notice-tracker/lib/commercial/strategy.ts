export type PricingPlan = {
  name: string;
  price: string;
  cadence: string;
  contractBand: string;
  description: string;
  features: string[];
  highlight?: boolean;
};

export type ServicePackage = {
  name: string;
  targetBuyer: string;
  painItSolves: string;
  whoBuysIt: string;
  includes: string[];
  whyBuy: string;
  deliveryModel: "one_time" | "recurring";
  whyProfitable: string;
  retentionFit: string;
  antiAgencyGuardrail: string;
};

export type ServiceStrategy = {
  earlyServices: string[];
  productizeLater: string[];
  neverOffer: string[];
  ladderIntoExpansion: string[];
};

export type RoadmapAction = {
  workstream:
    | "pricing_packaging"
    | "conversion"
    | "retention"
    | "analytics"
    | "cost_control"
    | "expansion_revenue"
    | "gtm_efficiency";
  title: string;
  roi: "high" | "medium";
  difficulty: "low" | "medium" | "high";
  priority: "P1" | "P2";
  summary: string;
};

export type RoadmapPhase = {
  label: string;
  horizon: "30_days" | "60_days" | "90_days" | "12_months";
  actions: RoadmapAction[];
};

export const pricingPlans: PricingPlan[] = [
  {
    name: COMMERCIAL_PLAN_DEFINITIONS.starter.label,
    price: `$${COMMERCIAL_PLAN_DEFINITIONS.starter.monthlyPriceUsd}`,
    cadence: "/month",
    contractBand: `Up to ${COMMERCIAL_PLAN_DEFINITIONS.starter.trackedContractLimit} active tracked contracts`,
    description:
      "For lean ops teams replacing spreadsheets with a real renewal calendar and owner workflow.",
    features: [
      `${COMMERCIAL_PLAN_DEFINITIONS.starter.includedEditors} included editor seats and unlimited viewers`,
      "AI extraction, review workflow, and reminders",
      "CSV and Excel export",
      "Bulk spreadsheet import",
      "Monthly digest and templates"
    ]
  },
  {
    name: COMMERCIAL_PLAN_DEFINITIONS.growth.label,
    price: `$${COMMERCIAL_PLAN_DEFINITIONS.growth.monthlyPriceUsd}`,
    cadence: "/month",
    contractBand: `Up to ${COMMERCIAL_PLAN_DEFINITIONS.growth.trackedContractLimit} active tracked contracts`,
    description:
      "For teams that need collaboration, escalations, and operational control across departments.",
    features: [
      `${COMMERCIAL_PLAN_DEFINITIONS.growth.includedEditors} included editor seats and unlimited viewers`,
      "Multi-recipient reminders and escalations",
      "Slack and Teams delivery",
      "Renewal decisions and playbooks",
      "Priority support and admin tooling"
    ],
    highlight: true
  },
  {
    name: "Portfolio",
    price: "Custom",
    cadence: "",
    contractBand: "500+ active tracked contracts",
    description:
      "For larger portfolios that need governance, security, and implementation support without buying CLM.",
    features: [
      "Custom contract bands",
      "Security and approval controls",
      "SSO and enterprise-lite governance",
      "Guided rollout and data migration",
      "Priority success support"
    ]
  }
];

export const servicePackages: ServicePackage[] = [
  {
    name: "Onboarding Package",
    targetBuyer: "New Starter and Growth accounts with one clear owner but weak rollout discipline.",
    painItSolves:
      "The buyer wants to get operational quickly without inventing the workflow from scratch or stalling after signup.",
    whoBuysIt:
      "Starter and Growth buyers with a clear owner who need a fast rollout without internal ops design work.",
    includes: [
      "Kickoff and success plan",
      "Workspace settings and notification setup",
      "Owner model and review queue configuration",
      "First dashboard walk-through"
    ],
    whyBuy:
      "It reduces time-to-value, gives the team a clean operating setup, and avoids a failed rollout during the first two weeks.",
    deliveryModel: "one_time",
    whyProfitable:
      "Highly standardized, low custom effort, and easy to deliver repeatedly with a tight checklist.",
    retentionFit:
      "Gets the account to first operational habit quickly so the product becomes part of the weekly workflow.",
    antiAgencyGuardrail:
      "Limit the package to a fixed kickoff, one configuration pass, and one follow-up review. No custom process redesign beyond the renewal workflow."
  },
  {
    name: "Spreadsheet Cleanup / Import Package",
    targetBuyer: "Teams migrating from messy spreadsheets with inconsistent fields and no clean source of truth.",
    painItSolves:
      "Historical contract data is too messy to import cleanly, which blocks adoption and creates support drag.",
    whoBuysIt:
      "Teams moving from messy Excel or CSV files with inconsistent columns, duplicates, and missing owners.",
    includes: [
      "Source file normalization",
      "Import mapping and duplicate cleanup",
      "Owner and department field cleanup",
      "First production import"
    ],
    whyBuy:
      "It turns a painful migration project into a fast launch, so the account can centralize meaningful coverage instead of abandoning the rollout.",
    deliveryModel: "one_time",
    whyProfitable:
      "High perceived pain relief with repeatable delivery steps and limited strategy overhead.",
    retentionFit:
      "Historical data lands in the product early, which materially raises switching cost and stickiness.",
    antiAgencyGuardrail:
      "Accept only spreadsheet normalization, mapping, and import work. Reject open-ended data cleanup projects with undefined scope."
  },
  {
    name: "Renewal Operations Setup Package",
    targetBuyer: "Growth accounts that need a disciplined reminder, ownership, and escalation model across teams.",
    painItSolves:
      "The buyer has software access but no clear operating model for how renewal responsibility should flow.",
    whoBuysIt:
      "Growth accounts that need a real process for reminders, escalations, owners, and renewal decisions.",
    includes: [
      "Reminder offset design",
      "Escalation and recipient routing setup",
      "Department and status model design",
      "Template and playbook configuration"
    ],
    whyBuy:
      "It gives the customer a ready-to-run renewal operating cadence instead of leaving them to configure complex coordination rules alone.",
    deliveryModel: "one_time",
    whyProfitable:
      "A small amount of expert process setup creates outsized customer value and supports higher plan retention.",
    retentionFit:
      "The product becomes the operating system for renewals instead of a passive record repository.",
    antiAgencyGuardrail:
      "Keep the scope inside reminder timing, owner routing, and renewal decisions. Do not offer custom approval chains or CLM-style workflow design."
  },
  {
    name: "Quarterly Review Package",
    targetBuyer: "Growth and Portfolio customers with enough renewal volume to justify recurring portfolio hygiene.",
    painItSolves:
      "The account risks stale owners, stale decisions, and dirty portfolio data if nobody runs a periodic renewal review.",
    whoBuysIt:
      "Growth and Portfolio customers with enough contract volume to need recurring portfolio hygiene reviews.",
    includes: [
      "Quarterly renewal risk review",
      "Owner gap and overdue review audit",
      "Renewal-decision hygiene review",
      "Action summary for the next quarter"
    ],
    whyBuy:
      "It gives the customer a recurring governance moment that keeps the portfolio current without building a heavy services dependency.",
    deliveryModel: "recurring",
    whyProfitable:
      "Light recurring advisory work with a strong renewal and expansion influence.",
    retentionFit:
      "Reinforces product usage every quarter and creates a repeat reason to keep data current.",
    antiAgencyGuardrail:
      "Use a fixed review template and a capped session format. No bespoke contract-by-contract consulting outside the defined review pack."
  },
  {
    name: "Reporting Package",
    targetBuyer: "Finance, procurement, and operations leaders who need portfolio visibility without manual spreadsheet prep.",
    painItSolves:
      "Leadership wants renewal exposure and decision status in a clean format, but the team is still assembling reports by hand.",
    whoBuysIt:
      "Finance, procurement, and operations leaders who need executive-ready renewal exposure reporting.",
    includes: [
      "Renewal exposure summary",
      "Notice-period risk report",
      "Decision status reporting",
      "Executive-ready recurring format"
    ],
    whyBuy:
      "It saves time for the operating team and raises executive visibility, which makes the product harder to cut later.",
    deliveryModel: "recurring",
    whyProfitable:
      "Uses product data already captured, so delivery can be templatized and margin-rich.",
    retentionFit:
      "Makes the product visible to leadership and ties retention to reporting habits, not just user preference.",
    antiAgencyGuardrail:
      "Standardize outputs to a fixed set of recurring reports. Do not build custom analytics projects or board-deck consulting."
  },
  {
    name: "Admin / Training Package",
    targetBuyer: "Accounts rolling out to several editors, departments, or new owners who need fast operational adoption.",
    painItSolves:
      "Admins and operators do not know how to run the tool consistently, which creates support load and weak internal adoption.",
    whoBuysIt:
      "Teams rolling the product out across several editors, departments, or operational owners.",
    includes: [
      "Admin training session",
      "Role and workflow handoff",
      "Internal SOP guidance",
      "Office hours for launch"
    ],
    whyBuy:
      "It reduces rollout confusion, shortens support cycles, and helps the buyer create internal champions quickly.",
    deliveryModel: "one_time",
    whyProfitable:
      "Low delivery cost if standardized and batchable, with strong support-cost reduction.",
    retentionFit:
      "Increases internal adoption and lowers long-term support burden by teaching the team how to run the tool properly.",
    antiAgencyGuardrail:
      "Keep it to standard enablement sessions, office hours, and SOP templates. Do not provide embedded admin labor."
  }
];

export const serviceStrategy: ServiceStrategy = {
  earlyServices: [
    "Onboarding Package",
    "Spreadsheet Cleanup / Import Package",
    "Renewal Operations Setup Package"
  ],
  productizeLater: [
    "Quarterly Review Package",
    "Reporting Package",
    "Admin / Training Package"
  ],
  neverOffer: [
    "Contract drafting or legal review services",
    "Custom CLM workflow design",
    "Embedded contract operations staffing",
    "Open-ended spreadsheet remediation with no scope cap",
    "Bespoke analytics or executive consulting outside renewal operations"
  ],
  ladderIntoExpansion: [
    "Use onboarding to accelerate time-to-value and reduce trial-to-paid drop-off.",
    "Use spreadsheet cleanup to move more historical contracts into the system, increasing switching cost.",
    "Use renewal operations setup to justify Growth by making escalations and routing operational.",
    "Use quarterly review and reporting to create recurring executive visibility and expansion conversations.",
    "Use admin enablement to support wider rollout across teams and departments."
  ]
};

export const roadmapPhases: RoadmapPhase[] = [
  {
    label: "30 Days",
    horizon: "30_days",
    actions: [
      {
        workstream: "pricing_packaging",
        title: "Finalize explicit plan rules and active contract bands",
        roi: "high",
        difficulty: "low",
        priority: "P1",
        summary: "Lock Starter, Growth, and Portfolio boundaries around contract bands and coordination depth."
      },
      {
        workstream: "conversion",
        title: "Ship trial-expiry and gate-based upgrade prompts",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: `Add prompts on trial aging, export, import, contract-cap pressure, and multi-recipient attempts within the ${COMMERCIAL_POLICY.trialDurationDays}-day trial window.`
      },
      {
        workstream: "retention",
        title: "Launch first-value onboarding checklist",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Drive first upload, first review, first reminder, and first owner assignment."
      },
      {
        workstream: "analytics",
        title: "Instrument source-to-trial-to-paid funnel",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Track pricing source, auth source, trial creation, activation, and checkout intent."
      },
      {
        workstream: "cost_control",
        title: "Audit extraction and support-heavy usage",
        roi: "high",
        difficulty: "low",
        priority: "P1",
        summary: "Measure where free and trial usage consumes gross margin."
      },
      {
        workstream: "expansion_revenue",
        title: "Package onboarding and import services",
        roi: "high",
        difficulty: "low",
        priority: "P1",
        summary: "Turn messy spreadsheet migrations into paid implementation revenue."
      },
      {
        workstream: "gtm_efficiency",
        title: "Narrow ICP messaging",
        roi: "high",
        difficulty: "low",
        priority: "P1",
        summary: "Aim messaging at finance ops, procurement ops, vendor management, and legal ops-lite."
      }
    ]
  },
  {
    label: "60 Days",
    horizon: "60_days",
    actions: [
      {
        workstream: "pricing_packaging",
        title: "Test annual-first plan presentation",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Push annual conversion for better cash efficiency and lower churn."
      },
      {
        workstream: "conversion",
        title: "Segment trial rescue campaigns by activation stage",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Treat no-upload, no-review, no-reminder, and no-checkout users differently."
      },
      {
        workstream: "retention",
        title: "Add owner-gap and renewal-decision hygiene prompts",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Push users to complete the workflows that actually create recurring value."
      },
      {
        workstream: "analytics",
        title: "Create role-based dashboards",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Give founder, growth, CS, and finance views into conversion and retention."
      },
      {
        workstream: "cost_control",
        title: "Standardize support and import SOPs",
        roi: "medium",
        difficulty: "medium",
        priority: "P2",
        summary: "Reduce setup cost and support drag with repeatable workflows."
      },
      {
        workstream: "expansion_revenue",
        title: "Launch quarterly review and reporting packages",
        roi: "medium",
        difficulty: "low",
        priority: "P2",
        summary: "Create repeatable add-ons for Growth customers."
      },
      {
        workstream: "gtm_efficiency",
        title: "Validate best acquisition channels",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Double down on outbound, partner, or content only after conversion quality is clear."
      }
    ]
  },
  {
    label: "90 Days",
    horizon: "90_days",
    actions: [
      {
        workstream: "pricing_packaging",
        title: "Define expansion rules above Growth",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Establish cleaner contract-band and included-seat expansion before large accounts arrive."
      },
      {
        workstream: "conversion",
        title: "Build sales-assist routing for high-fit trials",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Route qualified active trials into assisted conversion."
      },
      {
        workstream: "retention",
        title: "Launch account health scoring",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Use owner gaps, review gaps, reminder inactivity, and admin inactivity to flag churn risk."
      },
      {
        workstream: "analytics",
        title: "Establish cohort and margin reporting by segment",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Tie retention, expansion, and gross margin back to ICP and channel."
      },
      {
        workstream: "cost_control",
        title: "Add extraction-cost and support-cost reporting",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Identify margin-destructive accounts early."
      },
      {
        workstream: "expansion_revenue",
        title: "Launch Portfolio qualification motion",
        roi: "medium",
        difficulty: "medium",
        priority: "P2",
        summary: "Reserve higher-touch work for accounts with real ACV potential."
      },
      {
        workstream: "gtm_efficiency",
        title: "Cut poor-fit enterprise CLM pursuits",
        roi: "high",
        difficulty: "low",
        priority: "P1",
        summary: "Protect CAC and roadmap focus by disqualifying the wrong buyers."
      }
    ]
  },
  {
    label: "12 Months",
    horizon: "12_months",
    actions: [
      {
        workstream: "pricing_packaging",
        title: "Mature contract-band-first monetization",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Keep pricing anchored to active tracked contracts and coordination depth."
      },
      {
        workstream: "conversion",
        title: "Build predictable self-serve plus sales-assist funnel",
        roi: "high",
        difficulty: "high",
        priority: "P1",
        summary: "Route accounts by activation quality and buying intent instead of one-size-fits-all motion."
      },
      {
        workstream: "retention",
        title: "Embed quarterly and monthly operating rituals",
        roi: "high",
        difficulty: "high",
        priority: "P1",
        summary: "Make the product part of recurring operations, not just one-time setup."
      },
      {
        workstream: "analytics",
        title: "Establish full unit economics reporting",
        roi: "high",
        difficulty: "high",
        priority: "P1",
        summary: "Measure CAC, payback, gross margin, expansion, and LTV by segment."
      },
      {
        workstream: "cost_control",
        title: "Automate repetitive onboarding and support work",
        roi: "high",
        difficulty: "high",
        priority: "P1",
        summary: "Protect gross margin as the customer base scales."
      },
      {
        workstream: "expansion_revenue",
        title: "Turn add-ons into a repeatable catalog",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Standardize services and avoid drifting into custom consulting."
      },
      {
        workstream: "gtm_efficiency",
        title: "Own a narrow renewal-ops category",
        roi: "high",
        difficulty: "medium",
        priority: "P1",
        summary: "Compete on operational control, not broad contract software claims."
      }
    ]
  }
];
import { COMMERCIAL_PLAN_DEFINITIONS, COMMERCIAL_POLICY } from "@/lib/billing/policy";
